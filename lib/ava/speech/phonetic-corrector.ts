import dictionary from "@/data/ava/speech-phonetic-dictionary.json";
import { normalizeLoose } from "@/lib/ava/normalize-loose";
import { phoneticKey, similarEnough } from "@/lib/ava/speech/fuzzy";

type DictCategory = "BRAND" | "CITY" | "PRODUCT_FLAVOR" | "BUSINESS_TERM" | "FIDELATOO_TERM";

type DictEntry = {
  id: string;
  category: DictCategory;
  canonical: string;
  variants: string[];
};

const ENTRIES = dictionary.entries as DictEntry[];

function hasBusinessCue(loose: string): boolean {
  return /\b(magasin|boutique|horaire|ouvert|fermez|adresse|ou|où|store|shop|telephone|numero|allvap|vap)\b/.test(
    loose.replace(/ou /g, "ou "),
  ) || /\b(magasin|boutique|horaire|ouvert|fermez|adresse|store|hautmont|quesnoy)\b/.test(loose);
}

function hasProductCue(loose: string): boolean {
  return /\b(liquide|menthe|fraise|fruit|frais|gourmand|sucre|vape|eliquide|saveur|gout|mint|fresh|fruity|ml|cherche|veux|truc|quoi|de la|monte|montte)\b/.test(
    loose,
  );
}

function categoryAllowed(cat: DictCategory, loose: string, lastTopic?: string | null): boolean {
  if (cat === "CITY") {
    return (
      hasBusinessCue(loose) ||
      lastTopic === "store" ||
      lastTopic === "hours" ||
      /\b(hautmont|quesnoy|omon|kenoi|magasin|boutique)\b/.test(loose)
    );
  }
  if (cat === "BRAND") {
    return (
      hasBusinessCue(loose) ||
      /^(all ?vaps?|ol ?vaps?|allvaps|al vaps|all vape)$/.test(loose) ||
      /\b(all ?vap|ol vap|boutique|magasin)\b/.test(loose)
    );
  }
  if (cat === "FIDELATOO_TERM") {
    return /\b(fidel|ouvre|app)\b/.test(loose);
  }
  if (cat === "PRODUCT_FLAVOR") {
    return hasProductCue(loose) || lastTopic === "product" || loose.split(" ").length <= 3;
  }
  return true;
}

function applyCanonical(text: string, variant: string, canonical: string): string {
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  if (re.test(text)) return text.replace(re, canonical);
  return text;
}

/**
 * Corrections STT contextuelles — jamais un remplacement global arbitraire.
 */
export function applyPhoneticCorrections(
  text: string,
  lastTopic?: string | null,
): { text: string; applied: string[] } {
  let out = text;
  const applied: string[] = [];
  const loose = normalizeLoose(text);

  if (/\bmagasin\b/.test(loose) && /\b(mon|omon|au monde)\b/.test(loose) && !/\bhautmont\b/.test(loose)) {
    out = out.replace(/\b(o\s*mon|au monde|omon|de mon)\b/gi, "Hautmont");
    applied.push("mon→Hautmont");
  }

  for (const entry of ENTRIES) {
    if (!categoryAllowed(entry.category, loose, lastTopic)) continue;
    for (const variant of entry.variants) {
      const v = variant.trim();
      if (!v || normalizeLoose(v) === normalizeLoose(entry.canonical)) {
        if (loose.includes(normalizeLoose(v)) && v.toLowerCase() !== entry.canonical.toLowerCase()) {
          const next = applyCanonical(out, v, entry.canonical);
          if (next !== out) {
            out = next;
            applied.push(`${v}→${entry.canonical}`);
          }
        }
        continue;
      }
      if (loose.includes(normalizeLoose(v)) || similarEnough(loose, normalizeLoose(v))) {
        const next = applyCanonical(out, v, entry.canonical);
        if (next !== out) {
          out = next;
          applied.push(`${v}→${entry.canonical}`);
          break;
        }
        // utterance entière proche d'une variante courte (ex. "o mon")
        if (
          loose.split(" ").length <= 4 &&
          (phoneticKey(loose) === phoneticKey(v) || similarEnough(loose, normalizeLoose(v)))
        ) {
          if (entry.category === "CITY" && categoryAllowed("CITY", `${loose} magasin`, lastTopic)) {
            out = entry.canonical;
            applied.push(`${v}→${entry.canonical}`);
            break;
          }
        }
      }
    }
  }

  return { text: out, applied };
}

export function lookupFlavorCanonical(text: string): string | null {
  const loose = normalizeLoose(text);
  for (const entry of ENTRIES) {
    if (entry.category !== "PRODUCT_FLAVOR") continue;
    if (entry.variants.some((v) => loose.includes(normalizeLoose(v)) || similarEnough(loose, normalizeLoose(v)))) {
      return entry.canonical;
    }
  }
  return null;
}
