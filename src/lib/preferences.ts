import { generateDisplayName } from "./display-name.ts";
import type { DateKey } from "../types.ts";

const STORAGE_KEY = "markal.preferences";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface UserPreferences {
  userName: string;
  /** Per-calendar last day the user marked/edited — drives the initial week. */
  lastTouchedDates: Record<string, DateKey>;
}

type Listener = (prefs: UserPreferences) => void;

const listeners = new Set<Listener>();
let cached: UserPreferences | null = null;

/** Keep only string→DateKey entries; drops anything malformed. */
function sanitizeTouched(raw: unknown): Record<string, DateKey> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, DateKey> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && DATE_RE.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

function readFromStorage(): UserPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    if (typeof parsed.userName !== "string" || parsed.userName.length === 0) {
      return null;
    }
    // A malformed lastTouchedDates must not discard the whole prefs object.
    return {
      userName: parsed.userName,
      lastTouchedDates: sanitizeTouched(parsed.lastTouchedDates),
    };
  } catch {
    return null;
  }
}

function writeToStorage(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable or quota exceeded
  }
}

export function getPreferences(): UserPreferences {
  if (cached) return cached;
  const stored = readFromStorage();
  if (stored) {
    cached = stored;
    return cached;
  }
  cached = { userName: generateDisplayName(), lastTouchedDates: {} };
  writeToStorage(cached);
  return cached;
}

export function setPreferences(
  patch: Partial<UserPreferences>,
): UserPreferences {
  const current = getPreferences();
  const next: UserPreferences = { ...current, ...patch };
  if (typeof next.userName !== "string" || next.userName.length === 0) {
    next.userName = current.userName;
  }
  if (!next.lastTouchedDates || typeof next.lastTouchedDates !== "object") {
    next.lastTouchedDates = current.lastTouchedDates;
  }
  cached = next;
  writeToStorage(next);
  for (const listener of listeners) listener(next);
  return next;
}

/** Record the last day the user touched in a calendar (merges the map). */
export function setLastTouchedDate(calendarId: string, date: DateKey): void {
  const current = getPreferences();
  if (current.lastTouchedDates[calendarId] === date) return;
  setPreferences({
    lastTouchedDates: { ...current.lastTouchedDates, [calendarId]: date },
  });
}

export function subscribeToPreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
