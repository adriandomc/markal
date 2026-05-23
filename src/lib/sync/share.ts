/**
 * Sharing primitives: room IDs, encryption keys, and link generation.
 *
 * Keys never leave the browser memory or the URL fragment; the fragment
 * is not transmitted to the server.
 */

const KEY_BYTES = 32; // 256-bit
const ROOM_BYTES = 24; // 192-bit; base64url ~32 chars

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const fixed = pad === 0 ? padded : padded + "=".repeat(4 - pad);
  const binary = atob(fixed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateRoomId(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(ROOM_BYTES)));
}

export function generateEncryptionKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

export function isValidRoomId(value: string): boolean {
  // Match base64url shape; length within sensible range.
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function isValidKey(value: string): boolean {
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === KEY_BYTES;
  } catch {
    return false;
  }
}

export interface ShareLink {
  url: string;
  roomId: string;
  key: string;
}

export function buildShareLink(origin: string, roomId: string, key: string): ShareLink {
  // Fragment (#…) never reaches the server — the key stays client-side.
  return {
    url: `${origin}/c/${roomId}#k=${key}`,
    roomId,
    key,
  };
}

export function parseShareFragment(hash: string): string | null {
  if (!hash) return null;
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of normalized.split("&")) {
    const [name, value] = part.split("=");
    if (name === "k" && value) return value;
  }
  return null;
}
