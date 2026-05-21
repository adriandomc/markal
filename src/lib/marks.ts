import type { MarkAction } from "../types.ts";

export const ABSOLUTE_MAX_MARKS_PER_DAY = 4;
export const DEFAULT_MAX_MARKS_PER_DAY = 4;

export function clampMaxMarksPerDay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_MARKS_PER_DAY;
  }
  return Math.min(ABSOLUTE_MAX_MARKS_PER_DAY, Math.max(1, Math.round(value)));
}

export function applyLegendToDate(
  current: string[] = [],
  legendId: string,
  action: MarkAction,
  maxMarksPerDay: number = DEFAULT_MAX_MARKS_PER_DAY,
): string[] {
  const next = current.filter((id) => id !== legendId);

  if (action === "remove") {
    return next;
  }

  if (current.includes(legendId)) {
    return current;
  }

  if (current.length >= maxMarksPerDay) {
    return current;
  }

  return [...next, legendId];
}

export function cleanMarks(marks: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(marks).filter(([, ids]) => ids.length > 0));
}
