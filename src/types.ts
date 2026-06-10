export type DateKey = string;
export type ViewMode = "week" | "months" | "years";
export type MarkAction = "add" | "remove";
export type BoardMode = "marks" | "schedule";

export interface DateRange {
  start: DateKey;
  end: DateKey;
}

export interface LegendItem {
  id: string;
  label: string;
  fillColor: string;
}

export interface Activity {
  id: string;
  label:string;
  fillColor: string;
}

export interface ScheduledBlock {
  id: string;
  activityId: string;
  startDate: DateKey;
  endDate: DateKey;
  startMinutes: number;
  endMinutes: number;
}

export interface CalendarSettings {
  showOutMonthMarks: boolean;
  maxMarksPerDay: number;
  selectWeekends: boolean;
}

export interface CalendarDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  dateRange: DateRange;
  legends: LegendItem[];
  marks: Record<DateKey, string[]>;
  activities: Activity[];
  blocks: Record<string, ScheduledBlock>;
  settings: CalendarSettings;
}

export interface CalendarCollection {
  schemaVersion: 1;
  selectedId: string;
  documents: CalendarDocument[];
}

export interface ExportPayload {
  document: CalendarDocument;
  format: "png" | "pdf";
  requestedAt: string;
}
