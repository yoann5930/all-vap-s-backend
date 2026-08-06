/**
 * Moteur de prononciation française naturelle (pas d'accent anglais).
 */
import pronunciations from "@/data/ava/pronunciations.json";

export type PronunciationEntry = {
  spoken: string;
  languageStyle: string;
  noForeignAccent: boolean;
  aliases?: string[];
};

export type PronunciationDict = Record<string, PronunciationEntry>;

const dict = pronunciations as PronunciationDict;

export function getPronunciationDict(): PronunciationDict {
  return dict;
}

export function findPronunciation(term: string): PronunciationEntry | null {
  const t = term.trim();
  if (!t) return null;
  if (dict[t]) return dict[t];
  const lower = t.toLowerCase();
  for (const [key, entry] of Object.entries(dict)) {
    if (key.toLowerCase() === lower) return entry;
    if (entry.aliases?.some((a) => a.toLowerCase() === lower)) return entry;
  }
  return null;
}

/** Applique les prononciations connues au texte oral. */
export function applyPronunciations(text: string): string {
  let out = text;
  // Plus longues clés d'abord pour éviter les remplacements partiels
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const entry = dict[key];
    const variants = [key, ...(entry.aliases ?? [])];
    for (const v of variants) {
      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), entry.spoken);
    }
  }
  // Règle obligatoire e.Tasty → i tésti (avec point)
  out = out
    .replace(/\be\s*[.·•]\s*tasty\b/gi, "i tésti")
    .replace(/\be[\s-]?tasty\b/gi, "i tésti")
    .replace(/\betasty\b/gi, "i tésti");
  return out;
}

export function listPronunciations(): Array<{ brand: string } & PronunciationEntry> {
  return Object.entries(dict).map(([brand, entry]) => ({ brand, ...entry }));
}
