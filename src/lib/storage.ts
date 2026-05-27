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

/**
 * Phase 4 storage: one Y.Doc per calendar (so a shared calendar can sync
 * without exposing the others) plus a small "index" Y.Doc that tracks
 * which calendars live on this device.
 *
 *   markal-index-v2          ── index (selectedId + ordered ids)
 *   markal-calendar-<id>      ── one Y.Doc per calendar (data + optional shareInfo)
 *
 * Migration:
 *   markal-data-v1 (Phase 1/2 single-doc) → split into per-calendar docs.
 *   localStorage  (legacy)                 → bootstrap initial collection.
 */

export interface ShareInfo {
  roomId: string;
  encryptionKey: string;
  createdAt: string;
}

const INDEX_IDB = "markal-index-v2";
const PHASE2_LEGACY_IDB = "markal-data-v1";

const LEGACY_LOCALSTORAGE_KEY = "markal.collection.v1";
const LEGACY_COOLCAL_KEY = "coolcal.collection.v1";

function calendarIdbName(id: string): string {
  return `markal-calendar-${id}`;
}

interface CalendarEntry {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
}

class CalendarStore {
  indexDoc!: Y.Doc;
  private indexPersistence!: IndexeddbPersistence;
  private calendars: Map<string, CalendarEntry> = new Map();
  private listeners: Set<(c: CalendarCollection) => void> = new Set();

  async init(): Promise<void> {
    this.indexDoc = new Y.Doc();
    this.indexPersistence = new IndexeddbPersistence(INDEX_IDB, this.indexDoc);
    await this.indexPersistence.whenSynced;

    const ids = this.indexIds();

    if (ids.length === 0) {
      // Try legacy migrations first; don't auto-create a default yet, the
      // app might be on a share-landing URL and want to join a peer's calendar
      // before we decide to seed.
      await this.attemptMigrations();
      return;
    }

    // Load every calendar's Y.Doc and wire change listeners.
    await Promise.all(ids.map((id) => this.loadCalendarDoc(id)));
  }

  async ensureNotEmpty(): Promise<void> {
    if (this.indexIds().length > 0) return;
    const doc = createCalendarDocument();
    await this.createCalendar(doc, { selectAndAppend: true });
  }

  // ===== High-level snapshot API =====

  getCollection(): CalendarCollection {
    return {
      schemaVersion: 1,
      selectedId: this.indexSelectedId(),
      documents: this.indexIds()
        .map((id) => {
          const entry = this.calendars.get(id);
          return entry ? { id, entry } : null;
        })
        .filter((x): x is { id: string; entry: CalendarEntry } => x !== null)
        .map(({ id, entry }) => readDocument(entry.doc.getMap("doc"), id)),
    };
  }

  subscribe(listener: (c: CalendarCollection) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getCollection();
    for (const listener of this.listeners) listener(snapshot);
  }

  // ===== High-level mutation API =====

  save(collection: CalendarCollection): void {
    // Index ops: selectedId + add / remove ids.
    const rootMap = this.indexDoc.getMap("root");
    if (rootMap.get("selectedId") !== collection.selectedId) {
      this.indexDoc.transact(() => {
        rootMap.set("selectedId", collection.selectedId);
      });
    }

    const targetIds = new Set(collection.documents.map((d) => d.id));
    const currentIds = new Set(this.indexIds());

    // Remove calendars that no longer exist.
    for (const id of currentIds) {
      if (!targetIds.has(id)) {
        this.deleteCalendarLocally(id);
      }
    }

    // Reorder + add new entries.
    this.indexDoc.transact(() => {
      const idsArray = this.indexIdsArray();
      const existingIndexIds = new Set(idsArray.toArray());
      const desiredIds = collection.documents.map((d) => d.id);

      // Clear + repopulate to keep order in sync with input.
      if (idsArray.length > 0) idsArray.delete(0, idsArray.length);
      idsArray.push(desiredIds);

      // Discard for entries that were added; we'll create their Y.Docs below.
      // existingIndexIds is used only for diff detection.
      void existingIndexIds;
    });

    // Create or update each calendar Y.Doc.
    for (const doc of collection.documents) {
      const entry = this.calendars.get(doc.id);
      if (!entry) {
        // Create a fresh calendar Y.Doc synchronously (no await — we'll just create the IDB binding now)
        const cd = new Y.Doc();
        const persistence = new IndexeddbPersistence(calendarIdbName(doc.id), cd);
        this.calendars.set(doc.id, { doc: cd, persistence });
        this.wireUpdateListener(doc.id, cd);
        cd.transact(() => {
          writeDocument(cd.getMap("doc"), doc);
        });
      } else {
        entry.doc.transact(() => {
          writeDocument(entry.doc.getMap("doc"), doc);
        });
      }
    }
  }

  setSelectedId(id: string): void {
    this.indexDoc.transact(() => {
      this.indexDoc.getMap("root").set("selectedId", id);
    });
  }

  // ===== Sharing-related API =====

  /** Returns the per-calendar Y.Doc so callers can attach a WebrtcProvider. */
  getCalendarDoc(id: string): Y.Doc | undefined {
    return this.calendars.get(id)?.doc;
  }

  getShareInfo(id: string): ShareInfo | null {
    const entry = this.calendars.get(id);
    if (!entry) return null;
    const map = entry.doc.getMap("doc").get("shareInfo");
    if (!(map instanceof Y.Map)) return null;
    return {
      roomId: map.get("roomId") as string,
      encryptionKey: map.get("encryptionKey") as string,
      createdAt: map.get("createdAt") as string,
    };
  }

  setShareInfo(id: string, info: ShareInfo | null): void {
    const entry = this.calendars.get(id);
    if (!entry) return;
    entry.doc.transact(() => {
      const docMap = entry.doc.getMap("doc");
      if (info === null) {
        docMap.delete("shareInfo");
        return;
      }
      let infoMap = docMap.get("shareInfo");
      if (!(infoMap instanceof Y.Map)) {
        infoMap = new Y.Map();
        docMap.set("shareInfo", infoMap);
      }
      const map = infoMap as Y.Map<unknown>;
      map.set("roomId", info.roomId);
      map.set("encryptionKey", info.encryptionKey);
      map.set("createdAt", info.createdAt);
    });
  }

  /**
   * Find an existing local calendar that matches the given roomId, or
   * create an empty Y.Doc + persistence for the joiner to populate from
   * a remote peer.
   */
  async ensureSharedCalendar(roomId: string): Promise<string> {
    for (const [id, entry] of this.calendars) {
      const info = entry.doc.getMap("doc").get("shareInfo");
      if (info instanceof Y.Map && info.get("roomId") === roomId) {
        return id;
      }
    }

    // Create a new placeholder calendar with the same id as roomId so that
    // the local IDB has a unique slot. Title will be filled in by sync.
    const placeholderId = roomId;
    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(
      calendarIdbName(placeholderId),
      doc,
    );
    await persistence.whenSynced;
    this.calendars.set(placeholderId, { doc, persistence });
    this.wireUpdateListener(placeholderId, doc);

    // Do NOT pre-seed title/createdAt — let the peer sync deliver them.
    // Writing placeholder values here would race against the peer's writes
    // and Y.js would have to resolve which "set title" call wins.

    // Add to index if not present.
    this.indexDoc.transact(() => {
      const idsArray = this.indexIdsArray();
      const existing = idsArray.toArray();
      if (!existing.includes(placeholderId)) {
        idsArray.push([placeholderId]);
      }
      // If nothing is selected yet, select this shared calendar.
      if (!this.indexSelectedId()) {
        this.indexDoc.getMap("root").set("selectedId", placeholderId);
      }
    });

    return placeholderId;
  }

  /**
   * Ensure a per-calendar Y.Doc exists locally for the given id. Used by
   * the backup restore path to materialize Y.Docs before applying their
   * updates. Does NOT touch the index — the caller is expected to have
   * already applied the index update (or to do so afterwards).
   */
  async ensureCalendarDoc(id: string): Promise<Y.Doc> {
    let entry = this.calendars.get(id);
    if (!entry) {
      const doc = new Y.Doc();
      const persistence = new IndexeddbPersistence(calendarIdbName(id), doc);
      await persistence.whenSynced;
      entry = { doc, persistence };
      this.calendars.set(id, entry);
      this.wireUpdateListener(id, doc);
    }
    return entry.doc;
  }

  /** Force a snapshot broadcast (used after bulk updates like backup restore). */
  forceNotify(): void {
    this.notify();
  }

  // ===== Internals =====

  private indexIds(): string[] {
    const arr = this.indexDoc.getMap("root").get("ids");
    if (arr instanceof Y.Array) {
      return arr.toArray() as string[];
    }
    return [];
  }

  private indexIdsArray(): Y.Array<string> {
    const rootMap = this.indexDoc.getMap("root");
    let arr = rootMap.get("ids");
    if (!(arr instanceof Y.Array)) {
      arr = new Y.Array<string>();
      rootMap.set("ids", arr);
    }
    return arr as Y.Array<string>;
  }

  private indexSelectedId(): string {
    return (this.indexDoc.getMap("root").get("selectedId") as string) ?? "";
  }

  private async createCalendar(
    doc: CalendarDocument,
    options: { selectAndAppend: boolean },
  ): Promise<void> {
    const cd = new Y.Doc();
    const persistence = new IndexeddbPersistence(calendarIdbName(doc.id), cd);
    await persistence.whenSynced;
    this.calendars.set(doc.id, { doc: cd, persistence });
    this.wireUpdateListener(doc.id, cd);
    cd.transact(() => {
      writeDocument(cd.getMap("doc"), doc);
    });
    if (options.selectAndAppend) {
      this.indexDoc.transact(() => {
        this.indexIdsArray().push([doc.id]);
        this.indexDoc.getMap("root").set("selectedId", doc.id);
      });
    }
  }

  private deleteCalendarLocally(id: string): void {
    const entry = this.calendars.get(id);
    if (!entry) return;
    try {
      entry.persistence.destroy();
    } catch {
      // ignore
    }
    try {
      entry.doc.destroy();
    } catch {
      // ignore
    }
    this.calendars.delete(id);

    // Best-effort: remove the IDB database too.
    try {
      indexedDB.deleteDatabase(calendarIdbName(id));
    } catch {
      // ignore
    }
  }

  private wireUpdateListener(_id: string, doc: Y.Doc): void {
    doc.on(
      "update",
      (
        _update: Uint8Array,
        _origin: unknown,
        _yDoc: Y.Doc,
        transaction: Y.Transaction,
      ) => {
        if (transaction.local) {
          // Local mutations: app already mirrored state via save().
          return;
        }
        this.notify();
      },
    );
  }

  private async loadCalendarDoc(id: string): Promise<void> {
    if (this.calendars.has(id)) return;
    const doc = new Y.Doc();
    const persistence = new IndexeddbPersistence(calendarIdbName(id), doc);
    await persistence.whenSynced;
    this.calendars.set(id, { doc, persistence });
    this.wireUpdateListener(id, doc);
  }

  // ===== Migrations (legacy localStorage and Phase 1/2 single-doc) =====

  private async attemptMigrations(): Promise<boolean> {
    // Try Phase 1/2 single-doc IDB first (more recent).
    const fromPhase2 = await this.migrateFromPhase2();
    if (fromPhase2) return true;

    // Then try localStorage (oldest).
    const fromLocalStorage = await this.migrateFromLocalStorage();
    if (fromLocalStorage) return true;

    return false;
  }

  private async migrateFromPhase2(): Promise<boolean> {
    // Open the Phase 1/2 single-doc IDB without keeping it around.
    const tmpDoc = new Y.Doc();
    const tmpPersistence = new IndexeddbPersistence(PHASE2_LEGACY_IDB, tmpDoc);
    await tmpPersistence.whenSynced;

    const rootMap = tmpDoc.getMap("root");
    const phase1SnapshotMap = tmpDoc.getMap("collection");
    const phase1Json = phase1SnapshotMap.get("data") as string | undefined;

    let collection: CalendarCollection | null = null;

    if (rootMap.has("documents")) {
      collection = readCollection(rootMap);
    } else if (phase1Json) {
      try {
        collection = JSON.parse(phase1Json) as CalendarCollection;
      } catch {
        collection = null;
      }
    }

    try {
      tmpPersistence.destroy();
    } catch {
      // ignore
    }
    try {
      tmpDoc.destroy();
    } catch {
      // ignore
    }

    if (!collection || !collection.documents?.length) {
      return false;
    }

    // Save into the new per-calendar layout.
    const normalized = normalizeCollection(collection);
    for (const doc of normalized.documents) {
      await this.createCalendar(doc, { selectAndAppend: true });
    }
    this.indexDoc.transact(() => {
      this.indexDoc.getMap("root").set(
        "selectedId",
        normalized.selectedId || normalized.documents[0].id,
      );
    });

    // Wipe legacy IDB so the migration is one-way.
    try {
      indexedDB.deleteDatabase(PHASE2_LEGACY_IDB);
    } catch {
      // ignore
    }
    return true;
  }

  private async migrateFromLocalStorage(): Promise<boolean> {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY) ??
      localStorage.getItem(LEGACY_COOLCAL_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as CalendarCollection;
      if (parsed.schemaVersion !== 1 || !parsed.documents?.length) return false;
      const normalized = normalizeCollection(parsed);
      for (const doc of normalized.documents) {
        await this.createCalendar(doc, { selectAndAppend: true });
      }
      this.indexDoc.transact(() => {
        this.indexDoc.getMap("root").set(
          "selectedId",
          normalized.selectedId || normalized.documents[0].id,
        );
      });
      localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      localStorage.removeItem(LEGACY_COOLCAL_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

// ===== Module-level singleton =====

let store: CalendarStore | null = null;
let ready: Promise<void> | null = null;

/**
 * Initialize the storage layer and load any existing calendars from IDB.
 * Does NOT auto-seed a default if there's nothing — the caller decides
 * whether to seed (typically after handling a share landing).
 */
export async function initStorage(): Promise<void> {
  if (!store) {
    store = new CalendarStore();
    ready = store.init();
  }
  return ready!;
}

export async function loadCalendarCollection(): Promise<CalendarCollection> {
  await initStorage();
  await store!.ensureNotEmpty();
  return store!.getCollection();
}

export function saveCalendarCollection(collection: CalendarCollection): void {
  if (!store) {
    throw new Error(
      "Storage not initialized: call loadCalendarCollection first",
    );
  }
  store.save(collection);
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
  if (!store) {
    throw new Error("Storage not initialized");
  }
  return store.subscribe(listener);
}

/** Internal access for the sync layer; do not use from UI code directly. */
export function _getStore(): CalendarStore | null {
  return store;
}

export function getCalendarDoc(id: string): Y.Doc | undefined {
  return store?.getCalendarDoc(id);
}

export function getShareInfo(id: string): ShareInfo | null {
  return store?.getShareInfo(id) ?? null;
}

export function setShareInfo(id: string, info: ShareInfo | null): void {
  store?.setShareInfo(id, info);
}

export async function ensureSharedCalendar(roomId: string): Promise<string> {
  if (!store) throw new Error("Storage not initialized");
  return store.ensureSharedCalendar(roomId);
}

export function getIndexDoc(): Y.Doc | undefined {
  return store?.indexDoc;
}

export async function ensureCalendarDoc(id: string): Promise<Y.Doc> {
  if (!store) throw new Error("Storage not initialized");
  return store.ensureCalendarDoc(id);
}

export function notifyCollectionChanged(): void {
  store?.forceNotify();
}

export function getCollectionSnapshot(): CalendarCollection | null {
  return store?.getCollection() ?? null;
}

// ===== Read helpers: Y.js → JSON =====

function readDateRange(map: Y.Map<unknown>): DateRange {
  return {
    start: (map.get("start") as string) ?? "",
    end: (map.get("end") as string) ?? "",
  };
}

function readLegend(map: Y.Map<unknown>): LegendItem {
  return {
    id: map.get("id") as string,
    label: (map.get("label") as string) ?? "",
    fillColor: (map.get("fillColor") as string) ?? "#e5e7df",
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
    showOutMonthMarks: typeof map.get("showOutMonthMarks") === "boolean"
      ? (map.get("showOutMonthMarks") as boolean)
      : DEFAULT_SETTINGS.showOutMonthMarks,
    maxMarksPerDay: clampMaxMarksPerDay(
      typeof map.get("maxMarksPerDay") === "number"
        ? (map.get("maxMarksPerDay") as number)
        : DEFAULT_SETTINGS.maxMarksPerDay,
    ),
    selectWeekends: typeof map.get("selectWeekends") === "boolean"
      ? (map.get("selectWeekends") as boolean)
      : DEFAULT_SETTINGS.selectWeekends,
  };
}

function readDocument(map: Y.Map<unknown>, id: string): CalendarDocument {
  return {
    schemaVersion: 1,
    id,
    title: (map.get("title") as string) ?? "",
    createdAt: (map.get("createdAt") as string) ?? new Date().toISOString(),
    updatedAt: (map.get("updatedAt") as string) ?? new Date().toISOString(),
    dateRange: map.get("dateRange") instanceof Y.Map
      ? readDateRange(map.get("dateRange") as Y.Map<unknown>)
      : { start: "", end: "" },
    legends: map.get("legends") instanceof Y.Array
      ? (map.get("legends") as Y.Array<Y.Map<unknown>>).map(readLegend)
      : [],
    marks: map.get("marks") instanceof Y.Map
      ? readMarks(map.get("marks") as Y.Map<unknown>)
      : {},
    settings: map.get("settings") instanceof Y.Map
      ? readSettings(map.get("settings") as Y.Map<unknown>)
      : { ...DEFAULT_SETTINGS },
  };
}

function readCollection(rootMap: Y.Map<unknown>): CalendarCollection {
  return {
    schemaVersion: 1,
    selectedId: (rootMap.get("selectedId") as string) ?? "",
    documents: rootMap.get("documents") instanceof Y.Array
      ? (rootMap.get("documents") as Y.Array<Y.Map<unknown>>).map((m) =>
        readDocument(m, (m.get("id") as string) ?? "")
      )
      : [],
  };
}

// ===== Write helpers: JSON → Y.js (with diffing) =====

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
  const currentIds: string[] = [];
  const currentById = new Map<string, Y.Map<unknown>>();
  arr.forEach((legendMap) => {
    const id = legendMap.get("id") as string;
    currentIds.push(id);
    currentById.set(id, legendMap);
  });
  const targetIds = legends.map((l) => l.id);
  const targetIdSet = new Set(targetIds);

  const sameMembership = currentIds.length === targetIds.length &&
    currentIds.every((id) => targetIdSet.has(id));
  const sameOrder = sameMembership &&
    currentIds.every((id, i) => id === targetIds[i]);

  if (sameOrder) {
    // Same set + same order: patch fields in place to preserve CRDT history
    // for concurrent label/color edits from peers.
    for (const legend of legends) {
      const existing = currentById.get(legend.id);
      if (existing) writeLegendInto(existing, legend);
    }
    return;
  }

  // Order changed (or membership): rebuild the array so reorderings reach
  // peers. Y.Array doesn't support moving entries, so we tombstone the old
  // entries and insert fresh Y.Maps in the target order.
  if (arr.length > 0) arr.delete(0, arr.length);
  const fresh: Y.Map<unknown>[] = legends.map((legend) => {
    const map = new Y.Map<unknown>();
    writeLegendInto(map, legend);
    return map;
  });
  if (fresh.length > 0) arr.push(fresh);
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
  for (const key of toDelete) map.delete(key);

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
  setIfChanged(map, "selectWeekends", settings.selectWeekends);
}

function getOrCreateMap(parent: Y.Map<unknown>, key: string): Y.Map<unknown> {
  let map = parent.get(key);
  if (!(map instanceof Y.Map)) {
    map = new Y.Map<unknown>();
    parent.set(key, map);
  }
  return map as Y.Map<unknown>;
}

function getOrCreateArray<T>(
  parent: Y.Map<unknown>,
  key: string,
): Y.Array<T> {
  let arr = parent.get(key);
  if (!(arr instanceof Y.Array)) {
    arr = new Y.Array<T>();
    parent.set(key, arr);
  }
  return arr as Y.Array<T>;
}

function writeDocument(map: Y.Map<unknown>, document: CalendarDocument): void {
  // Note: `id` is intentionally NOT written. The id is the local index key
  // and lives outside the Y.Doc so it never participates in CRDT merges.
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

// ===== Normalization (for legacy data) =====

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
        selectWeekends: typeof document.settings?.selectWeekends === "boolean"
          ? document.settings.selectWeekends
          : DEFAULT_SETTINGS.selectWeekends,
      },
    })),
  };
}
