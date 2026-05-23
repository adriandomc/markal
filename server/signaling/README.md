# Markal signaling server

Minimal WebSocket pub/sub broker for [`y-webrtc`](https://github.com/yjs/y-webrtc).
Speaks the y-webrtc signaling protocol (`subscribe` / `unsubscribe` /
`publish` / `ping`). State is in-memory only; no logs of content.

## What it sees, what it doesn't

- **Sees**: opaque `topic` strings (random room IDs) and the IPs needed for
  WebRTC peer hole-punching.
- **Doesn't see**: any calendar data. WebRTC payloads are end-to-end encrypted
  (DTLS-SRTP) plus an extra app-layer AES-GCM in Markal, both keyed off material
  that never reaches this server. `publish` messages pass through verbatim.

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
| `MARKAL_ALLOWED_ORIGINS` | (unset) | Comma-separated allowlist of `Origin` headers. Unset = permissive. |
| `MARKAL_MAX_MSG_PER_SEC` | `60` | Per-connection message rate limit. Exceeding closes the socket with code 1008. |

## Alternatives

If you ever need a stateful WebSocket platform with edge presence, Cloudflare
Durable Objects can host the same logic with minor refactoring (Durable Object
per topic). For Phase 1 of the rollout, Deno Deploy is enough.
