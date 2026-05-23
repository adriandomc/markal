import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { CalendarCollection, CalendarDocument } from "../types.ts";
import { createCalendarDocument, DEFAULT_SETTINGS } from "./calendar-doc.ts";
import { clampMaxMarksPerDay } from "./marks.ts";

const IDB_NAME = "markal-data-v1";
const SNAPSHOT_MAP_KEY = "collection";
const SNAPSHOT_DATA_KEY = "data";

const LEGACY_LOCALSTORAGE_KEY = "markal.collection.v1";
const LEGACY_COOLCAL_KEY = "coolcal.collection.v1";

let ydoc: Y.Doc | null = null;
let provider: IndexeddbPersistence | null = null;
let ready: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (ready) return ready;
  ydoc = new Y.Doc();
  provider = new IndexeddbPersistence(IDB_NAME, ydoc);
  ready = provider.whenSynced.then(() => undefined);
  return ready;
}

function readLegacyLocalStorage(): CalendarCollection | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)
    ?? localStorage.getItem(LEGACY_COOLCAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalendarCollection;
    if (parsed.schemaVersion === 1 && parsed.documents?.length) {
      return parsed;
    }
  } catch {
    // ignore corrupt legacy data
  }
  return null;
}

function clearLegacyLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  localStorage.removeItem(LEGACY_COOLCAL_KEY);
}

function writeSnapshot(collection: CalendarCollection): void {
  if (!ydoc) return;
  ydoc.transact(() => {
    ydoc!
      .getMap(SNAPSHOT_MAP_KEY)
      .set(SNAPSHOT_DATA_KEY, JSON.stringify(collection));
  });
}

export async function loadCalendarCollection(): Promise<CalendarCollection> {
  await ensureInitialized();
  const map = ydoc!.getMap(SNAPSHOT_MAP_KEY);
  const dataStr = map.get(SNAPSHOT_DATA_KEY) as string | undefined;

  if (dataStr) {
    try {
      const parsed = JSON.parse(dataStr) as CalendarCollection;
      if (parsed.schemaVersion === 1 && parsed.documents?.length) {
        return normalizeCollection(parsed);
      }
    } catch {
      // fall through to migration / fresh
    }
  }

  const legacy = readLegacyLocalStorage();
  if (legacy) {
    const normalized = normalizeCollection(legacy);
    writeSnapshot(normalized);
    clearLegacyLocalStorage();
    return normalized;
  }

  const document = createCalendarDocument();
  const initial: CalendarCollection = {
    schemaVersion: 1,
    selectedId: document.id,
    documents: [document],
  };
  writeSnapshot(initial);
  return initial;
}

export function saveCalendarCollection(collection: CalendarCollection): void {
  if (!ydoc) {
    throw new Error(
      "Storage not initialized: call loadCalendarCollection first",
    );
  }
  writeSnapshot(collection);
}

export function getSelectedDocument(
  collection: CalendarCollection,
): CalendarDocument {
  return collection.documents.find((document) =>
    document.id === collection.selectedId
  ) ?? collection.documents[0];
}

function normalizeCollection(
  collection: CalendarCollection,
): CalendarCollection {
  return {
    ...collection,
    documents: collection.documents.map((document) => ({
      ...document,
      legends: document.legends.map((legend) => ({
        id: legend.id,
        label: legend.label,
        fillColor: legend.fillColor,
      })),
      settings: normalizeSettings(document.settings),
    })),
  };
}

function normalizeSettings(
  settings: CalendarDocument["settings"] | undefined,
): CalendarDocument["settings"] {
  if (!settings) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    showOutMonthMarks: typeof settings.showOutMonthMarks === "boolean"
      ? settings.showOutMonthMarks
      : DEFAULT_SETTINGS.showOutMonthMarks,
    maxMarksPerDay: clampMaxMarksPerDay(
      typeof settings.maxMarksPerDay === "number"
        ? settings.maxMarksPerDay
        : DEFAULT_SETTINGS.maxMarksPerDay,
    ),
  };
}
