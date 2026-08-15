/** Accent themes. "teal" is the base palette in index.css (no overrides). */
export const ACCENTS = [
  { id: "teal", label: "Deep teal", swatch: "#0d9488" },
  { id: "emerald", label: "Emerald", swatch: "#059669" },
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "slate", label: "Slate", swatch: "#475569" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

const STORAGE_KEY = "vly-accent";

export function getAccent(): string {
  return document.documentElement.dataset.theme ?? "teal";
}

export function applyAccent(id: string) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable (private mode) — theme still applies for this visit
  }
}

/** Apply the stored accent on startup so it survives page loads. */
export function applyStoredAccent() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) document.documentElement.dataset.theme = stored;
  } catch {
    // ignore
  }
}
