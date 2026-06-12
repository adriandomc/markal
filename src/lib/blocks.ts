import type { Activity, DateKey, DateRange, ScheduledBlock } from "../types.ts";
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

/**
 * Drop activities no block references. With the 1:1 activity↔block model an
 * activity outlives its block only transiently; call this right after deleting
 * a block — never on load/sync, where a peer's block may not have arrived yet.
 */
export function pruneOrphanActivities(
  activities: Activity[],
  blocks: Record<string, ScheduledBlock>,
): Activity[] {
  const used = new Set(Object.values(blocks).map((block) => block.activityId));
  return activities.filter((activity) => used.has(activity.id));
}

/**
 * Activities referenced by blocks intersecting the given range, in the stable
 * order of the activities array. A multi-day block contributes its activity
 * once (dedupe by id), so the week panel lists each activity a single time.
 */
export function activitiesForRange(
  blocks: Record<string, ScheduledBlock>,
  activities: Activity[],
  range: DateRange,
): Activity[] {
  const used = new Set<string>();
  for (const block of Object.values(blocks)) {
    if (
      compareDateKeys(block.startDate, range.end) <= 0 &&
      compareDateKeys(range.start, block.endDate) <= 0
    ) {
      used.add(block.activityId);
    }
  }
  return activities.filter((activity) => used.has(activity.id));
}

export interface LaidOutBlock {
  block: ScheduledBlock;
  lane: number;
  laneCount: number;
}

export function layoutDayBlocks(blocks: ScheduledBlock[]): LaidOutBlock[] {
  const sorted = [...blocks].sort((a, b) =>
    a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );
  const result: LaidOutBlock[] = [];
  
  let i = 0;
  while (i < sorted.length) {
    const cluster = [sorted[i]];
    let clusterEnd = sorted[i].endMinutes;
    let j = i + 1;
    
    // Find all blocks that transitively overlap with the current cluster
    while (j < sorted.length && sorted[j].startMinutes < clusterEnd) {
      cluster.push(sorted[j]);
      clusterEnd = Math.max(clusterEnd, sorted[j].endMinutes);
      j++;
    }
    
    // Assign lanes within this cluster
    const laneEnds: number[] = [];
    const clusterPlaced = cluster.map((block) => {
      // Find the first lane where this block can fit (lane end <= block start)
      let lane = laneEnds.findIndex((end) => end <= block.startMinutes);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = block.endMinutes;
      return { block, lane, laneCount: 0 };
    });
    
    const laneCount = laneEnds.length;
    for (const item of clusterPlaced) {
      item.laneCount = laneCount;
      result.push(item);
    }
    
    i = j;
  }
  
  return result;
}