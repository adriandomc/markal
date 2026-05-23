/**
 * Passphrase-based encryption for backup blobs.
 *
 * KDF:    PBKDF2-SHA256, 600_000 iterations (OWASP 2023 guidance).
 * Cipher: AES-GCM-256.
 * Wire:   JSON envelope with base64-encoded salt, IV and ciphertext, plus
 *         the KDF parameters so the recipient can decrypt with just the
 *         passphrase.
 *
 * The envelope is intentionally self-describing — if we ever swap KDF or
 * cipher, older backups can still be opened.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export const CURRENT_ALGO = "AES-GCM-256/PBKDF2-SHA256" as const;

export interface EncryptedEnvelope {
  algo: typeof CURRENT_ALGO;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const textEncoder = new TextEncoder();

type Bytes = Uint8Array<ArrayBuffer>;

function randomBytes(length: number): Bytes {
  const view = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(view);
  return view as Bytes;
}

function encodeUtf8(value: string): Bytes {
  // TextEncoder.encode returns Uint8Array<ArrayBuffer> in modern lib.dom; this
  // narrows the type for downstream WebCrypto calls.
  return textEncoder.encode(value) as Bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const view = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return view as Bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWithPassphrase(
  plaintext: Uint8Array,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  // Re-pack the plaintext on a fresh ArrayBuffer so the type is concrete.
  const plain = new Uint8Array(new ArrayBuffer(plaintext.length));
  plain.set(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plain,
  );
  return {
    algo: CURRENT_ALGO,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptWithPassphrase(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<Uint8Array> {
  if (envelope.algo !== CURRENT_ALGO) {
    throw new Error(`Algoritmo no soportado: ${envelope.algo}`);
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt, envelope.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Frase incorrecta o respaldo corrupto");
  }
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<EncryptedEnvelope>;
  return v.algo === CURRENT_ALGO &&
    typeof v.iterations === "number" &&
    typeof v.salt === "string" &&
    typeof v.iv === "string" &&
    typeof v.ciphertext === "string";
}
