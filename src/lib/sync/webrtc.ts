import { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";
import { getPreferences } from "../preferences.ts";

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
  onPeers: () => void;
  onAwareness: () => void;
}

const providers = new Map<string, ActiveProvider>();
const peerListeners = new Set<(count: number) => void>();
const awarenessListeners = new Set<() => void>();

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

  provider.awareness.setLocalStateField("user", {
    name: getPreferences().userName,
  });

  const onPeers = () => notifyPeerListeners();
  const onAwareness = () => notifyAwarenessListeners();
  provider.on("peers", onPeers);
  provider.awareness.on("change", onAwareness);

  providers.set(options.calendarId, {
    provider,
    roomId: options.roomId,
    onPeers,
    onAwareness,
  });
  notifyPeerListeners();
  notifyAwarenessListeners();
  return provider;
}

export function disconnectShared(calendarId: string): void {
  const entry = providers.get(calendarId);
  if (!entry) return;
  try {
    entry.provider.off("peers", entry.onPeers);
  } catch {
    // ignore
  }
  try {
    entry.provider.awareness.off("change", entry.onAwareness);
  } catch {
    // ignore
  }
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
  notifyPeerListeners();
  notifyAwarenessListeners();
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

/** Total remote peers connected across all shared calendars. */
export function getConnectedPeerCount(): number {
  let total = 0;
  for (const entry of providers.values()) {
    total += Math.max(0, entry.provider.awareness.getStates().size - 1);
  }
  return total;
}

export function subscribeToPeerChanges(
  listener: (count: number) => void,
): () => void {
  peerListeners.add(listener);
  return () => {
    peerListeners.delete(listener);
  };
}

export interface PeerInfo {
  calendarId: string;
  clientId: number;
  name: string;
}

/** Snapshot of every remote peer across every shared calendar. */
export function getConnectedPeers(): PeerInfo[] {
  const peers: PeerInfo[] = [];
  for (const [calendarId, entry] of providers.entries()) {
    const localId = entry.provider.awareness.clientID;
    entry.provider.awareness.getStates().forEach((state, clientId) => {
      if (clientId === localId) return;
      const user = (state as { user?: { name?: string } }).user;
      const name = typeof user?.name === "string" && user.name.length > 0
        ? user.name
        : "";
      peers.push({ calendarId, clientId, name });
    });
  }
  return peers;
}

export function subscribeToAwarenessChanges(
  listener: () => void,
): () => void {
  awarenessListeners.add(listener);
  return () => {
    awarenessListeners.delete(listener);
  };
}

/** Push the user name to all active providers (e.g. after a rename). */
export function setLocalUserName(name: string): void {
  for (const entry of providers.values()) {
    entry.provider.awareness.setLocalStateField("user", { name });
  }
}

function notifyPeerListeners(): void {
  const count = getConnectedPeerCount();
  for (const listener of peerListeners) listener(count);
}

function notifyAwarenessListeners(): void {
  for (const listener of awarenessListeners) listener();
}
