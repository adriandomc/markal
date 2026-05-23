/**
 * Markal signaling server — minimal WebSocket pub/sub for y-webrtc, plus
 * a small OAuth token-exchange proxy for Google Drive backup.
 *
 * - Speaks the y-webrtc signaling protocol (subscribe / unsubscribe / publish / ping).
 * - Never inspects or persists `publish` payloads — they pass through verbatim.
 * - Topics (= y-webrtc room IDs) live only in memory and disappear when
 *   no client is subscribed to them.
 * - The OAuth proxy adds `client_secret` to token-exchange requests (which
 *   Google requires for Web Application clients even with PKCE) so the SPA
 *   never has to ship it. The proxy is stateless: it forwards the response
 *   verbatim and does not log tokens or payloads.
 *
 * Threat model:
 *   - Sees `topic` strings (random opaque IDs from clients) and IP addresses.
 *   - Cannot decrypt content (WebRTC + app-layer AES-GCM happen end-to-end).
 *   - During an OAuth exchange, the proxy briefly sees the user's tokens in
 *     transit. It does not store them; the operator must trust the host the
 *     same way they trust the rest of their infrastructure.
 *   - State is ephemeral; restart loses nothing the clients can't reform.
 *
 * Env:
 *   PORT (default 8080)
 *   MARKAL_ALLOWED_ORIGINS (comma-separated; unset = permissive)
 *   MARKAL_MAX_MSG_PER_SEC (default 60; per-connection rate limit)
 *   GOOGLE_CLIENT_ID     (required for /oauth/google/*)
 *   GOOGLE_CLIENT_SECRET (required for /oauth/google/*)
 */

interface SignalMessage {
  type?: string;
  topics?: string[];
  topic?: string;
}

const topics = new Map<string, Set<WebSocket>>();
const subscribedByClient = new Map<WebSocket, Set<string>>();
const rateState = new Map<WebSocket, { windowStart: number; count: number }>();

const PORT = Number(Deno.env.get("PORT") ?? "8080");
const MAX_MSG_PER_SEC = Number(Deno.env.get("MARKAL_MAX_MSG_PER_SEC") ?? "60");

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // socket may have closed concurrently; ignore
  }
}

function checkRate(socket: WebSocket): boolean {
  const now = Date.now();
  const state = rateState.get(socket);
  if (!state || now - state.windowStart > 1000) {
    rateState.set(socket, { windowStart: now, count: 1 });
    return true;
  }
  state.count += 1;
  if (state.count > MAX_MSG_PER_SEC) {
    return false;
  }
  return true;
}

function handleMessage(socket: WebSocket, raw: string): void {
  if (!checkRate(socket)) {
    socket.close(1008, "rate-limited");
    return;
  }

  let message: SignalMessage;
  try {
    message = JSON.parse(raw) as SignalMessage;
  } catch {
    return;
  }
  if (!message?.type) return;

  const subscribed = subscribedByClient.get(socket);
  if (!subscribed) return;

  switch (message.type) {
    case "subscribe":
      if (Array.isArray(message.topics)) {
        for (const topicName of message.topics) {
          if (typeof topicName !== "string" || topicName.length === 0) continue;
          let topic = topics.get(topicName);
          if (!topic) {
            topic = new Set();
            topics.set(topicName, topic);
          }
          topic.add(socket);
          subscribed.add(topicName);
        }
      }
      break;

    case "unsubscribe":
      if (Array.isArray(message.topics)) {
        for (const topicName of message.topics) {
          const topic = topics.get(topicName);
          if (topic) {
            topic.delete(socket);
            if (topic.size === 0) topics.delete(topicName);
          }
          subscribed.delete(topicName);
        }
      }
      break;

    case "publish":
      if (typeof message.topic === "string") {
        const receivers = topics.get(message.topic);
        if (receivers) {
          for (const receiver of receivers) {
            if (receiver !== socket) send(receiver, message);
          }
        }
      }
      break;

    case "ping":
      send(socket, { type: "pong" });
      break;
  }
}

function handleClose(socket: WebSocket): void {
  const subscribed = subscribedByClient.get(socket);
  if (subscribed) {
    for (const topicName of subscribed) {
      const topic = topics.get(topicName);
      if (topic) {
        topic.delete(socket);
        if (topic.size === 0) topics.delete(topicName);
      }
    }
  }
  subscribedByClient.delete(socket);
  rateState.delete(socket);
}

function isOriginAllowed(origin: string | null): boolean {
  const allowed = Deno.env.get("MARKAL_ALLOWED_ORIGINS");
  if (!allowed) return true;
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  return origin !== null && list.includes(origin);
}

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function corsHeaders(origin: string | null): HeadersInit {
  // Echo allowed origin back; deny otherwise. Matches the WebSocket check.
  const allowed = Deno.env.get("MARKAL_ALLOWED_ORIGINS");
  let allowOrigin = "*";
  if (allowed) {
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    allowOrigin = origin && list.includes(origin) ? origin : "";
  }
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

async function handleOAuthTokenExchange(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
  }
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return jsonResponse(
      { error: "oauth_not_configured" },
      503,
      origin,
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, origin);
  }
  const code = typeof payload.code === "string" ? payload.code : "";
  const codeVerifier = typeof payload.code_verifier === "string"
    ? payload.code_verifier
    : "";
  const redirectUri = typeof payload.redirect_uri === "string"
    ? payload.redirect_uri
    : "";
  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse(
      { error: "missing_parameters" },
      400,
      origin,
    );
  }
  // Ignore the client's `client_id` if any — we trust the server-side one.
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("code", code);
  body.set("code_verifier", codeVerifier);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirectUri);
  const upstream = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ??
        "application/json",
      ...corsHeaders(origin),
    },
  });
}

async function handleOAuthRefresh(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
  }
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return jsonResponse(
      { error: "oauth_not_configured" },
      503,
      origin,
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, origin);
  }
  const refreshToken = typeof payload.refresh_token === "string"
    ? payload.refresh_token
    : "";
  if (!refreshToken) {
    return jsonResponse(
      { error: "missing_parameters" },
      400,
      origin,
    );
  }
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  const upstream = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ??
        "application/json",
      ...corsHeaders(origin),
    },
  });
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  // OAuth proxy routes
  if (url.pathname === "/oauth/google/token") {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(req.headers.get("origin")),
      });
    }
    if (req.method === "POST") {
      return await handleOAuthTokenExchange(req);
    }
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (url.pathname === "/oauth/google/refresh") {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(req.headers.get("origin")),
      });
    }
    if (req.method === "POST") {
      return await handleOAuthRefresh(req);
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  // WebSocket upgrade (signaling)
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Markal signaling — WebSocket only", {
      status: 426,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (!isOriginAllowed(req.headers.get("origin"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  subscribedByClient.set(socket, new Set());

  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") handleMessage(socket, event.data);
  });
  socket.addEventListener("close", () => handleClose(socket));
  socket.addEventListener("error", () => handleClose(socket));

  return response;
});

console.log(`Markal signaling listening on :${PORT}`);
