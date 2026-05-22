import type { CalendarCollection, CalendarDocument } from "../types.ts";
import { createCalendarDocument, DEFAULT_SETTINGS } from "./calendar-doc.ts";
import { clampMaxMarksPerDay } from "./marks.ts";

const STORAGE_KEY = "markal.collection.v1";
const LEGACY_STORAGE_KEY = "coolcal.collection.v1";

export function loadCalendarCollection(): CalendarCollection {
  let raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      raw = legacy;
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CalendarCollection;
      if (parsed.schemaVersion === 1 && parsed.documents?.length) {
        return normalizeCollection(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const document = createCalendarDocument();
  return {
    schemaVersion: 1,
    selectedId: document.id,
    documents: [document],
  };
}

export function saveCalendarCollection(collection: CalendarCollection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

export function getSelectedDocument(collection: CalendarCollection): CalendarDocument {
  return collection.documents.find((document) => document.id === collection.selectedId) ?? collection.documents[0];
}

function normalizeCollection(collection: CalendarCollection): CalendarCollection {
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
