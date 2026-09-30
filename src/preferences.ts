import { detectLocale, type Locale } from "./i18n";

export type ThemePreference = "system" | "light" | "dark";
export const fontPreferences = ["serif", "sans", "rounded", "mono", "custom"] as const;
export type FontPreference = (typeof fontPreferences)[number];
export const editorThemes = ["auto", "paper", "sepia", "mist", "slate", "night", "custom"] as const;
export type EditorTheme = (typeof editorThemes)[number];
export type PlatformFamily = "apple" | "windows" | "android" | "linux" | "other";

export type AppPreferences = {
  locale: Locale;
  theme: ThemePreference;
  reduceTransparency: boolean;
  reduceMotion: boolean;
  increaseContrast: boolean;
};

export type WritingPreferences = {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  editorWidth: number;
  fontFamily: FontPreference;
  // when fontFamily is "custom"
  customFont: string;
  editorTheme: EditorTheme;
  // when editorTheme is "custom"
  customBackground: string;
  customText: string;
};

export const defaultAppPreferences: AppPreferences = {
  locale: detectLocale(),
  theme: "system",
  reduceTransparency: false,
  reduceMotion: false,
  increaseContrast: false,
};

export const defaultWritingPreferences: WritingPreferences = {
  fontSize: 13,
  lineHeight: 1.8,
  letterSpacing: 0,
  editorWidth: 720,
  fontFamily: "serif",
  customFont: "",
  editorTheme: "auto",
  customBackground: "#f7f3ea",
  customText: "#2b2a27",
};

const hexColor = /^#[0-9a-f]{6}$/i;

// goes into font-family, strip anything that breaks the quotes
export function sanitizeFontName(value: string) {
  return value.replace(/["'\\;{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function normalizeWritingPreferences(value: WritingPreferences): WritingPreferences {
  const d = defaultWritingPreferences;
  return {
    ...value,
    fontFamily: fontPreferences.includes(value.fontFamily) ? value.fontFamily : d.fontFamily,
    customFont: typeof value.customFont === "string" ? sanitizeFontName(value.customFont) : d.customFont,
    editorTheme: editorThemes.includes(value.editorTheme) ? value.editorTheme : d.editorTheme,
    customBackground: hexColor.test(String(value.customBackground)) ? value.customBackground : d.customBackground,
    customText: hexColor.test(String(value.customText)) ? value.customText : d.customText,
  };
}

export function detectPlatform(userAgent = navigator.userAgent): PlatformFamily {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)) return "apple";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Linux|X11/i.test(userAgent)) return "linux";
  return "other";
}

export function loadPreferences<T extends object>(key: string, defaults: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaults;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const next = { ...defaults } as Record<string, unknown>;
    for (const preferenceKey of Object.keys(defaults)) {
      if (Object.prototype.hasOwnProperty.call(parsed, preferenceKey)) {
        next[preferenceKey] = (parsed as Record<string, unknown>)[preferenceKey];
      }
    }
    return next as T;
  } catch {
    return defaults;
  }
}

export function savePreferences<T extends object>(key: string, preferences: T) {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // storage can be blocked, just keep going
  }
}
