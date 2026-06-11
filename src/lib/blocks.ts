import type { Activity, DateKey, ScheduledBlock } from "../types.ts";
import { compareDateKeys, enumerateDays } from "./dates";

export const SNAP_MINUTES = 15;
export const MIN_BLOCK_MINUTES = 15;
export const MINUTES_PER_DAY = 1440;

export function snapMinutes(raw: number): number {
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(MINUTES_PER_DAY, Math.max(0, snapped));
}

export function clampBlockTimes(
  startMinutes: number,
  endMinutes: number
): { startMinutes: number; endMinutes: number } {
  let start = snapMinutes(Math.min(startMinutes, endMinutes));
  let end = snapMinutes(Math.max(startMinutes, endMinutes));
  if (end - start < MIN_BLOCK_MINUTES) {
    end = start + MIN_BLOCK_MINUTES;
    if (end > MINUTES_PER_DAY) {
      end = MINUTES_PER_DAY;
      start = end - MIN_BLOCK_MINUTES;
    }
  }
  return { startMinutes: start, endMinutes: end };
}

export function formatMinutes(minutes: number, locale: string): string {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function blockCoversDate(block: ScheduledBlock, date: DateKey): boolean {
  return compareDateKeys(block.startDate, date) <= 0 && compareDateKeys(date, block.endDate) <= 0;
}

export function blocksForDate(
  blocks: Record<string, ScheduledBlock>,
  date: DateKey,
): ScheduledBlock[] {
  return Object.values(blocks)
    .filter((block) => blockCoversDate(block, date))
    .sort((a, b) =>
      a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
    );
}

export function datesWithBlocks(
  blocks: Record<string, ScheduledBlock>,
): Set<DateKey> {
  const dates = new Set<DateKey>();
  for (const block of Object.values(blocks)) {
    for (const date of enumerateDays({ start: block.startDate, end: block.endDate })) {
      dates.add(date);
    }
  }
  return dates;
}

export function cleanBlocks(
  blocks: Record<string, ScheduledBlock>,
  activities: Activity[],
): Record<string, ScheduledBlock> {
  const validIds = new Set(activities.map((activity) => activity.id));
  return Object.fromEntries(
    Object.entries(blocks).filter(([, block]) => validIds.has(block.activityId)),
  );
}

export interface LaidOutBlock {
  block: ScheduledBlock;
  lane: number;
  laneCount: number;
}

/** Partition a day's blocks into lanes so overlapping ones sit side by side. */
export function layoutDayBlocks(blocks: ScheduledBlock[]): LaidOutBlock[] {
  const sorted = [...blocks].sort((a, b) =>
    a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );
  const laneEnds: number[] = []; // end of the last block placed in each lane
  const placed = sorted.map((block) => {
    let lane = laneEnds.findIndex((end) => end <= block.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = block.endMinutes;
    return { block, lane, laneCount: 0 };
  });
  const laneCount = laneEnds.length;
  return placed.map((item) => ({ ...item, laneCount }));
}