import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type {
  CalendarCollection,
  CalendarDocument,
  CalendarSettings,
  DateKey,
  DateRange,
  LegendItem,
} from "../types.ts";
import { createCalendarDocument, DEFAULT_SETTINGS } from "./calendar-doc.ts";
import { clampMaxMarksPerDay } from "./marks.ts";

const IDB_NAME = "markal-data-v1";
const ROOT_MAP_KEY = "root";
const PHASE1_LEGACY_MAP_KEY = "collection";
const PHASE1_LEGACY_DATA_KEY = "data";

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

// ===== Read: Y.js → JSON =====

function readDateRange(map: Y.Map<unknown>): DateRange {
  return {
    start: map.get("start") as string,
    end: map.get("end") as string,
  };
}

function readLegend(map: Y.Map<unknown>): LegendItem {
  return {
    id: map.get("id") as string,
    label: map.get("label") as string,
    fillColor: map.get("fillColor") as string,
  };
}

function readMarks(map: Y.Map<unknown>): Record<DateKey, string[]> {
  const result: Record<DateKey, string[]> = {};
  map.forEach((value, key) => {
    if (value instanceof Y.Array) {
      result[key] = value.toArray() as string[];
    }
  });
  return result;
}

function readSettings(map: Y.Map<unknown>): CalendarSettings {
  return {
    showOutMonthMarks:
      typeof map.get("showOutMonthMarks") === "boolean"
        ? (map.get("showOutMonthMarks") as boolean)
        : DEFAULT_SETTINGS.showOutMonthMarks,
    maxMarksPerDay: clampMaxMarksPerDay(
      typeof map.get("maxMarksPerDay") === "number"
        ? (map.get("maxMarksPerDay") as number)
        : DEFAULT_SETTINGS.maxMarksPerDay,
    ),
  };
}

function readDocument(map: Y.Map<unknown>): CalendarDocument {
  return {
    schemaVersion: 1,
    id: map.get("id") as string,
    title: map.get("title") as string,
    createdAt: map.get("createdAt") as string,
    updatedAt: map.get("updatedAt") as string,
    dateRange: readDateRange(map.get("dateRange") as Y.Map<unknown>),
    legends: (map.get("legends") as Y.Array<Y.Map<unknown>>).map(readLegend),
    marks: readMarks(map.get("marks") as Y.Map<unknown>),
    settings: readSettings(map.get("settings") as Y.Map<unknown>),
  };
}

function readCollection(rootMap: Y.Map<unknown>): CalendarCollection {
  return {
    schemaVersion: 1,
    selectedId: rootMap.get("selectedId") as string,
    documents: (rootMap.get("documents") as Y.Array<Y.Map<unknown>>).map(
      readDocument,
    ),
  };
}

// ===== Write: JSON → Y.js (with diffing) =====

function setIfChanged(map: Y.Map<unknown>, key: string, value: unknown): void {
  if (map.get(key) !== value) {
    map.set(key, value);
  }
}

function writeDateRange(map: Y.Map<unknown>, range: DateRange): void {
  setIfChanged(map, "start", range.start);
  setIfChanged(map, "end", range.end);
}

function writeLegendInto(map: Y.Map<unknown>, legend: LegendItem): void {
  setIfChanged(map, "id", legend.id);
  setIfChanged(map, "label", legend.label);
  setIfChanged(map, "fillColor", legend.fillColor);
}

function writeLegends(
  arr: Y.Array<Y.Map<unknown>>,
  legends: LegendItem[],
): void {
  const currentById = new Map<string, Y.Map<unknown>>();
  arr.forEach((legendMap) => {
    currentById.set(legendMap.get("id") as string, legendMap);
  });
  const targetIds = new Set(legends.map((l) => l.id));

  for (let i = arr.length - 1; i >= 0; i--) {
    const id = arr.get(i).get("id") as string;
    if (!targetIds.has(id)) {
      arr.delete(i, 1);
    }
  }

  for (const legend of legends) {
    const existing = currentById.get(legend.id);
    if (existing) {
      writeLegendInto(existing, legend);
    } else {
      const newMap = new Y.Map<unknown>();
      writeLegendInto(newMap, legend);
      arr.push([newMap]);
    }
  }
}

function writeMarks(
  map: Y.Map<unknown>,
  marks: Record<DateKey, string[]>,
): void {
  const targetKeys = new Set(Object.keys(marks));

  const toDelete: string[] = [];
  map.forEach((_, key) => {
    if (!targetKeys.has(key)) toDelete.push(key);
  });
  for (const key of toDelete) {
    map.delete(key);
  }

  for (const [date, legendIds] of Object.entries(marks)) {
    let arr = map.get(date) as Y.Array<string> | undefined;
    if (!arr) {
      arr = new Y.Array<string>();
      map.set(date, arr);
    }
    const current = arr.toArray();
    const equal = current.length === legendIds.length &&
      current.every((value, i) => value === legendIds[i]);
    if (!equal) {
      if (arr.length > 0) arr.delete(0, arr.length);
      if (legendIds.length > 0) arr.push(legendIds);
    }
  }
}

function writeSettings(map: Y.Map<unknown>, settings: CalendarSettings): void {
  setIfChanged(map, "showOutMonthMarks", settings.showOutMonthMarks);
  setIfChanged(map, "maxMarksPerDay", settings.maxMarksPerDay);
}

function getOrCreateMap(
  parent: Y.Map<unknown>,
  key: string,
): Y.Map<unknown> {
  let map = parent.get(key) as Y.Map<unknown> | undefined;
  if (!(map instanceof Y.Map)) {
    map = new Y.Map<unknown>();
    parent.set(key, map);
  }
  return map;
}

function getOrCreateArray<T>(
  parent: Y.Map<unknown>,
  key: string,
): Y.Array<T> {
  let arr = parent.get(key) as Y.Array<T> | undefined;
  if (!(arr instanceof Y.Array)) {
    arr = new Y.Array<T>();
    parent.set(key, arr);
  }
  return arr;
}

function writeDocumentInto(
  map: Y.Map<unknown>,
  document: CalendarDocument,
): void {
  setIfChanged(map, "id", document.id);
  setIfChanged(map, "title", document.title);
  setIfChanged(map, "createdAt", document.createdAt);
  setIfChanged(map, "updatedAt", document.updatedAt);

  writeDateRange(getOrCreateMap(map, "dateRange"), document.dateRange);
  writeLegends(
    getOrCreateArray<Y.Map<unknown>>(map, "legends"),
    document.legends,
  );
  writeMarks(getOrCreateMap(map, "marks"), document.marks);
  writeSettings(getOrCreateMap(map, "settings"), document.settings);
}

function writeDocuments(
  arr: Y.Array<Y.Map<unknown>>,
  documents: CalendarDocument[],
): void {
  const currentById = new Map<string, Y.Map<unknown>>();
  arr.forEach((docMap) => {
    currentById.set(docMap.get("id") as string, docMap);
  });
  const targetIds = new Set(documents.map((d) => d.id));

  for (let i = arr.length - 1; i >= 0; i--) {
    const id = arr.get(i).get("id") as string;
    if (!targetIds.has(id)) {
      arr.delete(i, 1);
    }
  }

  for (const document of documents) {
    const existing = currentById.get(document.id);
    if (existing) {
      writeDocumentInto(existing, document);
    } else {
      const newMap = new Y.Map<unknown>();
      writeDocumentInto(newMap, document);
      arr.push([newMap]);
    }
  }
}

function writeCollection(
  rootMap: Y.Map<unknown>,
  collection: CalendarCollection,
): void {
  setIfChanged(rootMap, "schemaVersion", collection.schemaVersion);
  setIfChanged(rootMap, "selectedId", collection.selectedId);
  writeDocuments(
    getOrCreateArray<Y.Map<unknown>>(rootMap, "documents"),
    collection.documents,
  );
}

// ===== Migrations =====

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
    // ignore corrupt legacy
  }
  return null;
}

function clearLegacyLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  localStorage.removeItem(LEGACY_COOLCAL_KEY);
}

function readPhase1LegacySnapshot(): CalendarCollection | null {
  if (!ydoc) return null;
  const snapshotMap = ydoc.getMap(PHASE1_LEGACY_MAP_KEY);
  const dataStr = snapshotMap.get(PHASE1_LEGACY_DATA_KEY) as string | undefined;
  if (!dataStr) return null;
  try {
    const parsed = JSON.parse(dataStr) as CalendarCollection;
    if (parsed.schemaVersion === 1 && parsed.documents?.length) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function clearPhase1LegacySnapshot(): void {
  if (!ydoc) return;
  const snapshotMap = ydoc.getMap(PHASE1_LEGACY_MAP_KEY);
  snapshotMap.clear();
}

// ===== Normalization (applied on read for safety) =====

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
      settings: {
        showOutMonthMarks: typeof document.settings?.showOutMonthMarks ===
            "boolean"
          ? document.settings.showOutMonthMarks
          : DEFAULT_SETTINGS.showOutMonthMarks,
        maxMarksPerDay: clampMaxMarksPerDay(
          typeof document.settings?.maxMarksPerDay === "number"
            ? document.settings.maxMarksPerDay
            : DEFAULT_SETTINGS.maxMarksPerDay,
        ),
      },
    })),
  };
}

// ===== Public API =====

export async function loadCalendarCollection(): Promise<CalendarCollection> {
  await ensureInitialized();
  const rootMap = ydoc!.getMap(ROOT_MAP_KEY);

  if (rootMap.has("selectedId") && rootMap.has("documents")) {
    return readCollection(rootMap);
  }

  // Empty Y.Doc; try migrations
  const phase1 = readPhase1LegacySnapshot();
  if (phase1) {
    const normalized = normalizeCollection(phase1);
    ydoc!.transact(() => {
      writeCollection(rootMap, normalized);
      clearPhase1LegacySnapshot();
    });
    return readCollection(rootMap);
  }

  const legacy = readLegacyLocalStorage();
  if (legacy) {
    const normalized = normalizeCollection(legacy);
    ydoc!.transact(() => {
      writeCollection(rootMap, normalized);
    });
    clearLegacyLocalStorage();
    return readCollection(rootMap);
  }

  const document = createCalendarDocument();
  const initial: CalendarCollection = {
    schemaVersion: 1,
    selectedId: document.id,
    documents: [document],
  };
  ydoc!.transact(() => {
    writeCollection(rootMap, initial);
  });
  return readCollection(rootMap);
}

export function saveCalendarCollection(collection: CalendarCollection): void {
  if (!ydoc) {
    throw new Error(
      "Storage not initialized: call loadCalendarCollection first",
    );
  }
  ydoc.transact(() => {
    writeCollection(ydoc!.getMap(ROOT_MAP_KEY), collection);
  });
}

export function getSelectedDocument(
  collection: CalendarCollection,
): CalendarDocument {
  return collection.documents.find((document) =>
    document.id === collection.selectedId
  ) ?? collection.documents[0];
}

export type CollectionListener = (collection: CalendarCollection) => void;

export function subscribeToCollectionChanges(
  listener: CollectionListener,
): () => void {
  if (!ydoc) {
    throw new Error(
      "Storage not initialized: call loadCalendarCollection first",
    );
  }
  const doc = ydoc;
  const handler = (
    _update: Uint8Array,
    _origin: unknown,
    _doc: Y.Doc,
    transaction: Y.Transaction,
  ): void => {
    if (transaction.local) {
      // Local mutations are already reflected by the caller (persist()).
      // We only react to remote/external updates here.
      return;
    }
    listener(readCollection(doc.getMap(ROOT_MAP_KEY)));
  };
  doc.on("update", handler);
  return () => doc.off("update", handler);
}
