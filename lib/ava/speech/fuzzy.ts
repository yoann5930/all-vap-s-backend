import { normalizeLoose } from "@/lib/ava/normalize-loose";

export function editDistance(a: string, b: string): number {
  const s = a || "";
  const t = b || "";
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = cur[j];
  }
  return prev[t.length];
}

/** Clé phonétique FR très légère (pas un vrai metaphone). */
export function phoneticKey(input: string): string {
  let s = normalizeLoose(input);
  s = s
    .replace(/\b(le|la|les|de|du|des|un|une)\b/g, " ")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/gn/g, "n")
    .replace(/eau/g, "o")
    .replace(/au/g, "o")
    .replace(/ou/g, "u")
    .replace(/ch/g, "sh")
    .replace(/h/g, "")
    .replace(/[aeiouy]+/g, (m) => m[0])
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, "");
  return s;
}

export function similarEnough(raw: string, canonical: string): boolean {
  const a = normalizeLoose(raw);
  const b = normalizeLoose(canonical);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (phoneticKey(a) && phoneticKey(a) === phoneticKey(b) && a.length >= 3) return true;
  const d = editDistance(a, b);
  if (a.length >= 8 && d <= 2) return true;
  if (a.length >= 4 && d <= 1) return true;
  return false;
}
