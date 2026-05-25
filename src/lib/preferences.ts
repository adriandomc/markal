import { generateDisplayName } from "./display-name.ts";

const STORAGE_KEY = "markal.preferences";

export interface UserPreferences {
  userName: string;
}

type Listener = (prefs: UserPreferences) => void;

const listeners = new Set<Listener>();
let cached: UserPreferences | null = null;

function readFromStorage(): UserPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    if (typeof parsed.userName !== "string" || parsed.userName.length === 0) {
      return null;
    }
    return { userName: parsed.userName };
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
  cached = { userName: generateDisplayName() };
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
  cached = next;
  writeToStorage(next);
  for (const listener of listeners) listener(next);
  return next;
}

export function subscribeToPreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
