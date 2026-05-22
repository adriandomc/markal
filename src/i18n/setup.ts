import { configureLocalization } from "@lit/localize";
import {
  allLocales,
  sourceLocale,
  targetLocales,
} from "./generated/locale-codes.ts";

export type LocaleCode = typeof allLocales[number];

const STORAGE_KEY = "markal.locale";

export const LOCALE_OPTIONS: ReadonlyArray<{
  code: LocaleCode;
  label: string;
}> = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
];

export const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: (locale) => import(`./generated/${locale}.ts`),
});

function isValidLocale(code: string): code is LocaleCode {
  return (allLocales as readonly string[]).includes(code);
}

function detectInitialLocale(): LocaleCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLocale(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }

  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  const prefix = nav.toLowerCase().split("-")[0];
  if (isValidLocale(prefix)) {
    return prefix;
  }
  return sourceLocale;
}

function syncHtmlLang(): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = getLocale();
  }
}

let initialized = false;
export async function initLocalization(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const initial = detectInitialLocale();
  if (initial !== sourceLocale) {
    try {
      await setLocale(initial);
    } catch {
      // fall back to source locale if loading fails
    }
  }
  syncHtmlLang();
}

export async function changeLocale(code: LocaleCode): Promise<void> {
  try {
    await setLocale(code);
  } catch {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // localStorage unavailable
  }
  syncHtmlLang();
}
