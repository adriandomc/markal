import type { CalendarDocument, CalendarSettings, LegendItem } from "../types.ts";
import { todayKey, yearRangeFor } from "./dates.ts";
import { DEFAULT_MAX_MARKS_PER_DAY } from "./marks.ts";

const DEFAULT_LEGENDS: Array<Omit<LegendItem, "id">> = [
  {
    label: "",
    fillColor: "#e5e7df",
  }
];

export const DEFAULT_SETTINGS: CalendarSettings = {
  showOutMonthMarks: true,
  maxMarksPerDay: DEFAULT_MAX_MARKS_PER_DAY,
};

export function createId(prefix = "id"): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createCalendarDocument(title?: string): CalendarDocument {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();

  return {
    schemaVersion: 1,
    id: createId("cal"),
    title: title ?? `Calendario ${year}`,
    createdAt: now,
    updatedAt: now,
    dateRange: yearRangeFor(todayKey()),
    legends: DEFAULT_LEGENDS.map((legend) => ({
      ...legend,
      id: createId("legend"),
    })),
    marks: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function duplicateCalendarDocument(
  document: CalendarDocument,
  title?: string,
): CalendarDocument {
  const now = new Date().toISOString();

  return {
    ...structuredClone(document),
    id: createId("cal"),
    title: title ?? `${document.title} copia`,
    createdAt: now,
    updatedAt: now,
  };
}
