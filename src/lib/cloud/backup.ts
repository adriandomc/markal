/**
 * Higher-level export/import: takes a CollectionBackup and either wraps it
 * in an encrypted JSON envelope (passphrase set) or writes it plain.
 *
 * Wire shape (UTF-8 JSON):
 *   plain     -> { format: "markal-backup",     version, exportedAt, indexUpdate, calendars }
 *   encrypted -> { format: "markal-backup-enc", version, exportedAt, envelope }
 *
 * Restoring uses a CRDT merge — see serializer.applyCollectionBackup.
 */

import {
  applyCollectionBackup,
  type CollectionBackup,
  exportCollectionBackup,
  isCollectionBackup,
} from "./serializer.ts";
import {
  decryptWithPassphrase,
  encryptWithPassphrase,
  type EncryptedEnvelope,
  isEncryptedEnvelope,
} from "./crypto.ts";

export interface EncryptedBackup {
  format: "markal-backup-enc";
  version: 1;
  exportedAt: string;
  envelope: EncryptedEnvelope;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<EncryptedBackup>;
  return v.format === "markal-backup-enc" && v.version === 1 &&
    isEncryptedEnvelope(v.envelope);
}

export async function exportBackupAsBlob(passphrase?: string): Promise<Blob> {
  const backup = exportCollectionBackup();
  if (!passphrase) {
    return new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
  }
  const plain = encoder.encode(JSON.stringify(backup));
  const envelope = await encryptWithPassphrase(plain, passphrase);
  const wrapper: EncryptedBackup = {
    format: "markal-backup-enc",
    version: 1,
    exportedAt: backup.exportedAt,
    envelope,
  };
  return new Blob([JSON.stringify(wrapper, null, 2)], {
    type: "application/json",
  });
}

export type ParsedBackup =
  | { kind: "plain"; backup: CollectionBackup }
  | { kind: "encrypted"; envelope: EncryptedEnvelope; exportedAt: string };

export async function parseBackupText(text: string): Promise<ParsedBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Archivo de respaldo inválido");
  }
  if (isEncryptedBackup(parsed)) {
    return {
      kind: "encrypted",
      envelope: parsed.envelope,
      exportedAt: parsed.exportedAt,
    };
  }
  if (isCollectionBackup(parsed)) {
    return { kind: "plain", backup: parsed };
  }
  throw new Error("Formato de archivo no reconocido");
}

export async function applyPlainBackup(backup: CollectionBackup): Promise<void> {
  await applyCollectionBackup(backup);
}

export async function decryptAndApplyBackup(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<void> {
  const plain = await decryptWithPassphrase(envelope, passphrase);
  const inner = JSON.parse(decoder.decode(plain));
  if (!isCollectionBackup(inner)) {
    throw new Error("Contenido descifrado no es un respaldo válido");
  }
  await applyCollectionBackup(inner);
}

export function downloadBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function suggestedBackupFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `markal-${stamp}.json`;
}
