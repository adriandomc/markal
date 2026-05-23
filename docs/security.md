# Markal — Security & Threat Model

This document describes Markal's security architecture and threat model. It
is meant for users who want to understand what Markal protects against, and
for auditors / contributors reviewing the code.

Markal is open source. Everything below can be cross-referenced against the
source tree.

---

## TL;DR

- Calendars live in your browser. Markal has no central database of user data.
- Shared calendars sync peer-to-peer with end-to-end encryption. The
  encryption key never reaches any server.
- Optional Drive backup is encrypted client-side with the user's passphrase.
  Markal cannot decrypt it.
- Signaling server is stateless; it only relays opaque WebRTC handshakes.

---

## Architecture overview

```
  ┌──────────────┐                                      ┌──────────────┐
  │  Browser A   │ ◄──── WebRTC (DTLS-SRTP)        ───► │  Browser B   │
  │ IndexedDB    │ ◄──── + AES-GCM-256 app-layer   ───► │ IndexedDB    │
  └──────┬───────┘                                      └──────┬───────┘
         │                                                     │
         │  SDP / ICE handshake (opaque payload)               │
         └──────────────┬──────────────────────────────────────┘
                        ▼
              ┌──────────────────────┐
              │  Markal signaling    │   stateless WebSocket relay
              │  signal.markal.app   │   does not store user content
              └──────────────────────┘

  Optional per-device backup:
  ┌──────────────┐                                  ┌──────────────┐
  │  Browser     │  ── encrypted JSON via PKCE ───► │ User's Drive │
  │              │  ◄── encrypted JSON via PKCE ─── │              │
  └──────────────┘                                  └──────────────┘
       PBKDF2-SHA256 (600k iter) + AES-GCM-256;
       passphrase only in user's browser memory.
```

---

## What Markal protects against

| Adversary | What they cannot do |
|---|---|
| **Markal operator (malicious or compromised)** | Read user calendars; tamper with them undetected. Operator infrastructure never receives plaintext. |
| **Markal infrastructure pwned** | Steal a database of users / content — there isn't one. The signaling server is stateless. |
| **Network eavesdropper** | Read shared-calendar traffic. WebRTC DTLS-SRTP encrypts the transport; y-webrtc adds AES-GCM-256 on the application layer with the key only the peers have. |
| **User's cloud provider (Drive, etc.)** | Read the backup. The blob uploaded is ciphertext keyed by the user's passphrase. |
| **Other apps using the same Drive account** | Access Markal's backup files. Drive scope is `drive.file` — only files this app created are visible to it. |

---

## What Markal does NOT protect against

| Threat | Why it's out of scope | Mitigation |
|---|---|---|
| **User's device compromised** | Inherent to any client-side app. If your browser is malware'd, plaintext is exposed. | Use standard endpoint hygiene. |
| **Share link leaked** | If Alice mails the share link `…/#k=…` to Bob via a compromised channel, the attacker can join the room. | Send share links over channels you trust (Signal, in person, etc.). |
| **Lost passphrase** | E2E cryptography means we cannot reset what we cannot read. | Markal exposes export/import to file as a passphrase-free backup option. |
| **Vendor lock-in of chosen cloud** | If Google closes your account, the Drive backup is gone. | Use export/import to file periodically as a secondary backup. |
| **CRDT merge ambiguity** | Two divergent offline edits may not merge the way a user expects (Y.js merges, but order is not the human-intuitive one). | Document; if surprising merges happen, restore from a previous file export. |

---

## Cryptographic primitives

| Use case | Algorithm | Source / library |
|---|---|---|
| Password-based key derivation (backup) | PBKDF2-SHA256, 600 000 iterations | Web Crypto API |
| Symmetric encryption (backup, P2P payload) | AES-GCM-256 | Web Crypto API (us); y-webrtc (P2P) |
| Random IDs / room IDs / fragment keys | `crypto.getRandomValues` (192–256 bit) | Web Crypto API |
| Transport security (P2P) | DTLS-SRTP | WebRTC stack (browser built-in) |
| Domain isolation (Drive backups) | OAuth 2.0 PKCE, scope `drive.file` | Google Identity Services |

No third-party crypto code is bundled. All primitives come from `window.crypto`
or browser-builtin WebRTC.

Source: `src/lib/cloud/crypto.ts`, `src/lib/sync/webrtc.ts`.

---

## P2P share flow

1. Alice creates a calendar locally → backed by Y.Doc + IndexedDB.
2. Alice clicks "Share". App generates:
   - `roomId` = 192-bit base64url-encoded random
   - `key`    = 256-bit base64url-encoded random (AES-GCM master key)
3. Link: `https://markal.app/c/<roomId>#k=<key>`. The `#` fragment is never
   transmitted to the server by any standard browser.
4. Bob opens the link. App reads `roomId` and `key` from the URL.
5. Both clients connect to the signaling server with `roomId` only. The
   server pairs them up; it never sees `key`.
6. WebRTC establishes a direct P2P channel (DTLS-SRTP encrypted).
7. y-webrtc additionally encrypts each update with AES-GCM-256 using a key
   derived (PBKDF2) from `key`.
8. Y.js merges updates as a CRDT; both clients converge.

Sources: `src/lib/sync/share.ts`, `src/lib/sync/webrtc.ts`.

### What the signaling server sees

- `roomId` (opaque, 32-char base64url)
- WebSocket connection IP
- SDP offer/answer payloads, which are themselves cryptographic public material
- Nothing about calendar contents

### What the signaling server stores

- Topic membership in memory (which connections are subscribed to which
  rooms). No persistence; restart wipes state.

Source: `server/signaling/main.ts` (~140 LOC).

---

## Drive backup flow

1. User clicks "Conectar Google Drive". App starts OAuth 2.0 PKCE:
   - Generates a code verifier and S256 challenge.
   - Redirects the user to Google's auth endpoint with the challenge.
2. Google redirects back with an authorization code.
3. App exchanges code + verifier for tokens (no client secret used, since
   PKCE binds the exchange to the same client that initiated it).
4. Tokens are stored in the browser's IndexedDB. Never sent anywhere else.
5. To push a backup:
   - App serializes all local Y.Docs to a backup JSON.
   - User's passphrase derives a key (PBKDF2-SHA256, 600 000 iter) with a
     fresh 16-byte salt.
   - JSON encrypted with AES-GCM-256 (fresh 12-byte IV).
   - Ciphertext + salt + IV uploaded as a single file (`markal-backup.json`)
     to the user's Drive root via the `drive.file` scope.
6. To pull a backup, the reverse: download, decrypt with passphrase, apply
   via `Y.applyUpdate` (CRDT merge — does not wipe local state).

Sources: `src/lib/cloud/drive.ts`, `src/lib/cloud/backup.ts`, `src/lib/cloud/crypto.ts`.

### What Google sees

- That an OAuth client (the Markal client_id you configured) is requesting
  the `drive.file` scope for this user.
- The presence and content of the encrypted file in the user's Drive — as
  ciphertext.
- API access patterns (read/write timestamps).

### What Google does not see

- The passphrase. It never leaves the browser.
- The decrypted contents of the backup.

### Revocation

The user can revoke Markal's Drive access from
[Google Account → Security → Third-party access](https://myaccount.google.com/permissions)
at any time. Markal's "Desconectar" button also revokes the refresh token via
Google's revoke endpoint as a best-effort step before clearing local tokens.

---

## Local storage map

| Location | Contents | Persistence |
|---|---|---|
| `IndexedDB[markal-index-v2]` | Index Y.Doc with ordered list of calendar IDs and current selection | Until user clears site data |
| `IndexedDB[markal-calendar-<id>]` | One Y.Doc per calendar (title, dates, legends, marks, settings, optional `shareInfo`) | Until user clears site data |
| `IndexedDB[markal-cloud-v1] / tokens / google-drive` | OAuth tokens for Drive (if connected) | Until user disconnects or clears site data |
| `localStorage[markal.sidebar.open]` | Sidebar open/closed UI preference | Until user clears site data |
| `localStorage[markal.locale]` | Selected interface language | Until user clears site data |
| `sessionStorage[markal.oauth.pkce]` | Ephemeral PKCE verifier and state during OAuth handshake | Cleared after callback completes |
| `sessionStorage[markal.oauth.flash]` | One-shot message to surface to UI after OAuth redirect | Cleared on next render |

No cookies (other than what the browser sets automatically for the page) and
no third-party tracking scripts.

---

## Public infrastructure boundaries

| Endpoint | Owner | Purpose |
|---|---|---|
| `markal.app` (web app) | Operator (you) | Hosts the static + SSR Astro bundle |
| `signal.markal.app` (WebSocket) | Operator (you) | Stateless WebRTC signaling relay |
| `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Google | OAuth 2.0 + Drive REST endpoints, only when user opts in to Drive |

A user who never shares a calendar and never connects Drive talks to nothing
outside `markal.app`. Period.

---

## Reporting security issues

Please email **adriandomc@gmail.com** with a description of the issue. PGP /
encrypted email is welcome but not required.

Please give us a reasonable window to address an issue before public
disclosure. We do not currently run a paid bug-bounty program.

---

## Caveats / known limitations

- **No revocation of issued share links.** A leaked share link grants access
  to anyone holding it. To revoke, move the calendar's data to a new
  calendar (which will get a new `roomId` and key).
- **No identity / signatures.** All participants of a shared calendar are
  symmetric — anyone with the link can read or write. There is no audit log
  of "who marked what".
- **Same-browser P2P uses BroadcastChannel.** Two tabs in the same browser
  exchange via `BroadcastChannel`, not WebRTC. This is a y-webrtc
  optimization and is fine semantically, but means in-browser testing does
  not fully exercise the WebRTC path.
- **Bundle size includes Y.js (~50KB gzip).** This is a deliberate tradeoff
  in favor of CRDT correctness and offline-first behavior.
