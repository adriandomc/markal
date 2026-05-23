import { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";

/**
 * Manages y-webrtc providers per shared calendar.
 *
 * Each entry encrypts updates via y-webrtc's built-in PBKDF2 + AES-GCM
 * derived from the `password` (our share key). DTLS-SRTP from WebRTC
 * itself provides transport-level encryption on top.
 *
 * The signaling URL is read from PUBLIC_MARKAL_SIGNALING_URL at build time
 * or falls back to localhost for `deno task signal:dev`.
 */

const DEFAULT_DEV_SIGNALING = "ws://localhost:8080";
const DEFAULT_PROD_SIGNALING = "wss://signal.markal.app";

function defaultSignalingUrl(): string {
  // Read from import.meta.env if available (Vite/Astro).
  const env = (import.meta as unknown as {
    env?: Record<string, string | undefined>;
  }).env;
  const fromEnv = env?.PUBLIC_MARKAL_SIGNALING_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }
  if (env?.DEV) {
    return DEFAULT_DEV_SIGNALING;
  }
  return DEFAULT_PROD_SIGNALING;
}

interface ActiveProvider {
  provider: WebrtcProvider;
  roomId: string;
}

const providers = new Map<string, ActiveProvider>();

export interface ConnectOptions {
  /** Stable calendar id (the key in our local store). */
  calendarId: string;
  /** Shared room identifier (must match between peers). */
  roomId: string;
  /** Base64url-encoded AES key (shared via the URL fragment). */
  encryptionKey: string;
  /** The Y.Doc to sync with peers. */
  doc: Y.Doc;
  /** Optional override of the signaling URL (e.g. for tests). */
  signalingUrl?: string;
}

export function connectShared(options: ConnectOptions): WebrtcProvider {
  const existing = providers.get(options.calendarId);
  if (existing) {
    if (existing.roomId === options.roomId) {
      return existing.provider;
    }
    // Room changed: tear down the old one.
    disconnectShared(options.calendarId);
  }

  const signaling = [options.signalingUrl ?? defaultSignalingUrl()];
  const provider = new WebrtcProvider(options.roomId, options.doc, {
    signaling,
    password: options.encryptionKey,
    maxConns: 20,
  });
  providers.set(options.calendarId, { provider, roomId: options.roomId });
  return provider;
}

export function disconnectShared(calendarId: string): void {
  const entry = providers.get(calendarId);
  if (!entry) return;
  try {
    entry.provider.disconnect();
  } catch {
    // ignore
  }
  try {
    entry.provider.destroy();
  } catch {
    // ignore
  }
  providers.delete(calendarId);
}

export function getActiveProvider(calendarId: string): WebrtcProvider | undefined {
  return providers.get(calendarId)?.provider;
}

export function isShared(calendarId: string): boolean {
  return providers.has(calendarId);
}

/** Disconnect all providers (e.g. on app teardown). */
export function disconnectAll(): void {
  for (const calendarId of Array.from(providers.keys())) {
    disconnectShared(calendarId);
  }
}
