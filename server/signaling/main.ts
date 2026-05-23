/**
 * Markal signaling server — minimal WebSocket pub/sub for y-webrtc.
 *
 * - Speaks the y-webrtc signaling protocol (subscribe / unsubscribe / publish / ping).
 * - Never inspects or persists `publish` payloads — they pass through verbatim.
 * - Topics (= y-webrtc room IDs) live only in memory and disappear when
 *   no client is subscribed to them.
 *
 * Threat model:
 *   - Sees `topic` strings (random opaque IDs from clients) and IP addresses.
 *   - Cannot decrypt content (WebRTC + app-layer AES-GCM happen end-to-end).
 *   - State is ephemeral; restart loses nothing the clients can't reform.
 *
 * Env:
 *   PORT (default 8080)
 *   MARKAL_ALLOWED_ORIGINS (comma-separated; unset = permissive)
 *   MARKAL_MAX_MSG_PER_SEC (default 60; per-connection rate limit)
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

Deno.serve({ port: PORT }, (req) => {
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
