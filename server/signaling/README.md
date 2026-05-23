# Markal signaling server

Two responsibilities in one tiny Deno service:

1. **WebSocket pub/sub broker** for [`y-webrtc`](https://github.com/yjs/y-webrtc).
   Speaks the y-webrtc signaling protocol (`subscribe` / `unsubscribe` /
   `publish` / `ping`). State is in-memory only; no logs of content.
2. **OAuth token-exchange proxy** for the Google Drive backup feature.
   Google's "Web Application" client type requires `client_secret` for the
   PKCE code exchange — which is not safe to ship in the SPA bundle. This
   server holds the secret as an env var and forwards the exchange request
   on behalf of the client. The proxy is stateless and never logs tokens.

## What it sees, what it doesn't

- **WebSocket leg**: opaque `topic` strings (random room IDs) and IPs for
  WebRTC peer hole-punching. WebRTC payloads are end-to-end encrypted
  (DTLS-SRTP) plus an extra app-layer AES-GCM, both keyed off material that
  never reaches this server. `publish` messages pass through verbatim.
- **OAuth leg**: briefly sees the user's authorization code in transit, and
  the access/refresh tokens in Google's response on their way back to the
  user's browser. Nothing is persisted. The operator has the same trust
  posture as for any other piece of their infrastructure.

## Local dev

```bash
deno task signal:dev
```

Connects on `ws://localhost:8080`. The Markal client uses this URL by default
when `import.meta.env.DEV` is true.

## Deploy on Coolify (self-hosted, recommended for Markal)

Coolify can run the signaling server as a second Application on the same VPS
that hosts the Markal app, using `server/signaling/Dockerfile`.

1. **New → Application → Public Repository** (or "Connect from Git source").
   Point it at the Markal repo, branch `main`.
2. **Build Pack**: Dockerfile.
3. **Dockerfile location**: `server/signaling/Dockerfile`.
4. **Build context**: leave default (repo root) — the Dockerfile copies
   `server/signaling/main.ts` relative to root.
5. **Ports exposes**: `8080`.
   - If your Coolify instance uses **Traefik**: mark **"Is this app a
     WebSocket"** so connections aren't buffered.
   - If your Coolify instance uses **Caddy**: no extra setting needed — Caddy
     proxies WebSocket upgrades automatically when it sees
     `Connection: Upgrade, Upgrade: websocket` in the request headers.
6. **Domain**: pick a subdomain like `signal.markal.app` (or whatever your
   Markal prod domain is). Coolify will issue the TLS cert automatically.
7. **Environment variables**:
   - `MARKAL_ALLOWED_ORIGINS` = your Markal prod origin (e.g. `https://markal.app`).
     Use a comma-separated list if you serve multiple domains.
   - `MARKAL_MAX_MSG_PER_SEC` *(optional)* — default `60`.
   - `GOOGLE_CLIENT_ID` = the same OAuth client_id the SPA uses
     (`PUBLIC_MARKAL_GOOGLE_CLIENT_ID`). Required for the Drive backup proxy
     routes; if unset, those routes return `503 oauth_not_configured`.
   - `GOOGLE_CLIENT_SECRET` = the client_secret from the Google Cloud OAuth
     client (Credentials → Web Application → Client secret). Server-side only;
     never expose it on the client.
8. **Resources**: 256MB RAM / 0.1 vCPU is plenty for the signaling workload;
   no persistent storage needed.
9. **Deploy**.

Note the resulting URL — typically `wss://signal.markal.app/` once TLS is
provisioned. This is what the Markal client will use in Phase 4 (we'll wire
it in via a build-time env var or runtime config).

## Deno Deploy as alternative

```bash
# Once
deno install -A jsr:@deno/deployctl

# Per deploy
deployctl deploy \
  --project=markal-signaling \
  --entrypoint=server/signaling/main.ts \
  --env=MARKAL_ALLOWED_ORIGINS=https://markal.app
```

Free tier (1M req/mo, 20GB egress) is more than enough for Markal's
signaling volume.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Listen port (Deno Deploy sets this automatically). |
| `MARKAL_ALLOWED_ORIGINS` | (unset) | Comma-separated allowlist of `Origin` headers. Applied to both WebSocket upgrades and OAuth proxy routes. Unset = permissive. |
| `MARKAL_MAX_MSG_PER_SEC` | `60` | Per-connection message rate limit. Exceeding closes the socket with code 1008. |
| `GOOGLE_CLIENT_ID` | (unset) | Google OAuth client_id. Required for the `/oauth/google/*` routes. |
| `GOOGLE_CLIENT_SECRET` | (unset) | Google OAuth client_secret. Server-side only. |

## HTTP routes (in addition to the WebSocket upgrade)

| Method | Path | Purpose |
|---|---|---|
| POST | `/oauth/google/token` | Exchange a PKCE authorization code for tokens. Body: `{ code, code_verifier, redirect_uri }`. Adds `client_secret` server-side. |
| POST | `/oauth/google/refresh` | Refresh an expired access token. Body: `{ refresh_token }`. |
| OPTIONS | `/oauth/google/*` | CORS preflight. |

All other paths return `426 Upgrade Required` (this service is otherwise
WebSocket-only).

## Alternatives

If you ever need a stateful WebSocket platform with edge presence, Cloudflare
Durable Objects can host the same logic with minor refactoring (Durable Object
per topic). For Phase 1 of the rollout, Deno Deploy is enough.
