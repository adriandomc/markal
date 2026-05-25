/**
 * Serialize the local per-calendar Y.Doc set into a backup payload, and
 * apply such a payload back to the local store.
 *
 * Each Y.Doc state is captured via Y.encodeStateAsUpdate (full state),
 * base64-encoded. Restoring uses Y.applyUpdate which performs a CRDT
 * merge — the local state and the backup converge instead of overwriting.
 */

import * as Y from "yjs";
import {
  ensureCalendarDoc,
  getCalendarDoc,
  getIndexDoc,
  notifyCollectionChanged,
} from "../storage.ts";
import {
  getPreferences,
  setPreferences,
  type UserPreferences,
} from "../preferences.ts";
import { setLocalUserName } from "../sync/webrtc.ts";

export interface CollectionBackup {
  format: "markal-backup";
  version: 1;
  exportedAt: string;
  indexUpdate: string;
  calendars: Record<string, string>;
  /** Per-device preferences (display name, etc.). Optional for backward compat. */
  preferences?: UserPreferences;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function exportCollectionBackup(): CollectionBackup {
  const indexDoc = getIndexDoc();
  if (!indexDoc) throw new Error("Storage no inicializado");

  const idsArr = indexDoc.getMap("root").get("ids");
  const ids = idsArr instanceof Y.Array ? (idsArr.toArray() as string[]) : [];

  const calendars: Record<string, string> = {};
  for (const id of ids) {
    const doc = getCalendarDoc(id);
    if (!doc) continue;
    calendars[id] = toBase64(Y.encodeStateAsUpdate(doc));
  }

  return {
    format: "markal-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    indexUpdate: toBase64(Y.encodeStateAsUpdate(indexDoc)),
    calendars,
    preferences: getPreferences(),
  };
}

export function isCollectionBackup(value: unknown): value is CollectionBackup {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<CollectionBackup>;
  return v.format === "markal-backup" && v.version === 1 &&
    typeof v.indexUpdate === "string" &&
    typeof v.calendars === "object" && v.calendars !== null;
}

export async function applyCollectionBackup(
  backup: CollectionBackup,
): Promise<void> {
  const indexDoc = getIndexDoc();
  if (!indexDoc) throw new Error("Storage no inicializado");

  Y.applyUpdate(indexDoc, fromBase64(backup.indexUpdate));

  for (const [id, base64Update] of Object.entries(backup.calendars)) {
    const doc = await ensureCalendarDoc(id);
    Y.applyUpdate(doc, fromBase64(base64Update));
  }

  if (backup.preferences && typeof backup.preferences.userName === "string") {
    setPreferences({ userName: backup.preferences.userName });
    setLocalUserName(backup.preferences.userName);
  }

  notifyCollectionChanged();
}
