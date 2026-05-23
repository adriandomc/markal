/**
 * Persists OAuth tokens for the Drive backup adapter in IndexedDB.
 *
 * Tokens are stored under a single key per provider. They grant access to
 * the user's own Drive — they are NOT secrets of the operator, but they
 * still deserve more isolation than localStorage gives, so we use IDB.
 */

const DB_NAME = "markal-cloud-v1";
const STORE = "tokens";
const KEY = "google-drive";

export interface DriveTokens {
  provider: "google-drive";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  obtainedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadDriveTokens(): Promise<DriveTokens | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () =>
      resolve((req.result as DriveTokens | undefined) ?? null);
  });
}

export async function saveDriveTokens(tokens: DriveTokens): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(tokens, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearDriveTokens(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
