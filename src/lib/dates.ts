import type { DateKey, DateRange, ViewMode } from "../types.ts";

export interface MonthInfo {
  year: number;
  monthIndex: number;
  key: string;
}

export interface DayCell {
  date: DateKey;
  day: number;
  inMonth: boolean;
  inRange: boolean;
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function dateKeyFromParts(year: number, monthIndex: number, day: number): DateKey {
  return toDateKey(new Date(year, monthIndex, day));
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a.localeCompare(b);
}

export function normalizeRange(range: DateRange): DateRange {
  if (compareDateKeys(range.start, range.end) <= 0) {
    return range;
  }

  return {
    start: range.end,
    end: range.start,
  };
}

export function addDays(key: DateKey, amount: number): DateKey {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function daysBetween(start: DateKey, end: DateKey): number {
  const startTime = parseDateKey(start).getTime();
  const endTime = parseDateKey(end).getTime();
  return Math.round((endTime - startTime) / 86_400_000);
}

export function enumerateDays(range: DateRange): DateKey[] {
  const normalized = normalizeRange(range);
  const days: DateKey[] = [];

  for (let date = normalized.start; compareDateKeys(date, normalized.end) <= 0; date = addDays(date, 1)) {
    days.push(date);
  }

  return days;
}

export function getAutoViewMode(range: DateRange): ViewMode {
  const normalized = normalizeRange(range);
  const dayCount = daysBetween(normalized.start, normalized.end) + 1;

  if (dayCount <= 14) {
    return "week";
  }

  if (dayCount <= 124) {
    return "months";
  }

  return "years";
}

export function monthsInRange(range: DateRange): MonthInfo[] {
  const normalized = normalizeRange(range);
  const start = parseDateKey(normalized.start);
  const end = parseDateKey(normalized.end);
  const months: MonthInfo[] = [];

  let year = start.getFullYear();
  let monthIndex = start.getMonth();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();

  while (year < endYear || (year === endYear && monthIndex <= endMonth)) {
    months.push({
      year,
      monthIndex,
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    });

    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }

  return months;
}

export function buildMonthGrid(year: number, monthIndex: number, range: DateRange): DayCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstVisible = new Date(year, monthIndex, 1 - firstOfMonth.getDay());
  const cells: DayCell[] = [];
  const normalized = normalizeRange(range);

  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + offset);
    const key = toDateKey(date);
    cells.push({
      date: key,
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      inRange: compareDateKeys(key, normalized.start) >= 0 && compareDateKeys(key, normalized.end) <= 0,
    });
  }

  return cells;
}

export function formatDisplayDate(key: DateKey, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parseDateKey(key));
}

export function formatMonthLabel(
  year: number,
  monthIndex: number,
  locale: string,
): string {
  const name = new Intl.DateTimeFormat(locale, { month: "long" })
    .format(new Date(year, monthIndex, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function yearRangeFor(dateKey: DateKey): DateRange {
  const year = parseDateKey(dateKey).getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}
