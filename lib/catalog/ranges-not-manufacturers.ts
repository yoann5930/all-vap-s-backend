/**
 * Noms qui sont des GAMMES, pas des fabricants / marques.
 * Source : correction Yoann (inventaire Marque / fabricant).
 * Ne jamais les proposer dans la liste fabricant. Ne jamais inventer Ravzn/Raven Juice.
 */
import { normalizeProductName } from "@/lib/catalog/normalize";

type RangeNotManufacturer = {
  /** Nom de gamme déjà utilisé en catalogue / base — ne pas renommer. */
  rangeName: string;
  slugs: string[];
  aliases: string[];
};

const RANGES_NOT_MANUFACTURERS: RangeNotManufacturer[] = [
  {
    rangeName: "Yum E-Bot",
    slugs: ["yum-ebot", "yumi-bot"],
    aliases: [
      "Yumi Bot",
      "Yum E-Bot",
      "Yum Ebot",
      "Yum E Bot",
      "Yumebot",
    ],
  },
  {
    rangeName: "Vape City",
    slugs: ["vape-city", "vapecity"],
    aliases: ["Vapecity", "Vape City"],
  },
  {
    rangeName: "Revenge Juices",
    slugs: ["revenge-juices", "revenge-juice"],
    aliases: ["Revenge Juice", "Revenge Juices"],
  },
  {
    rangeName: "Le Maudit",
    slugs: ["le-maudit"],
    aliases: ["Le Maudit"],
  },
  {
    rangeName: "Fruity Cool",
    slugs: ["fruity-cool"],
    aliases: ["Fruity Cool"],
  },
  {
    rangeName: "Big Kawa",
    slugs: ["big-kawa"],
    aliases: ["Big Kawa"],
  },
];

/** Noms inexistants — ne jamais les ajouter comme fabricant ni comme gamme. */
const NONEXISTENT_BRAND_ALIASES = [
  "ravzn juice",
  "raven juice",
  "ravznjuice",
  "ravenjuice",
  "ravzn",
];

function compact(raw: string): string {
  return normalizeProductName(raw).replace(/[\s\-_.']/g, "");
}

function aliasKeys(entry: RangeNotManufacturer): string[] {
  return [
    compact(entry.rangeName),
    ...entry.slugs.map(compact),
    ...entry.aliases.map(compact),
  ].filter((x) => x.length >= 5);
}

function findRangeEntry(raw: string | null | undefined): RangeNotManufacturer | null {
  const key = compact(raw || "");
  if (key.length < 5) return null;
  for (const entry of RANGES_NOT_MANUFACTURERS) {
    if (aliasKeys(entry).includes(key)) return entry;
  }
  return null;
}

export function isRangeNotManufacturerName(raw: string | null | undefined): boolean {
  return findRangeEntry(raw) != null;
}

export function isRangeNotManufacturerSlug(slug: string | null | undefined): boolean {
  const s = (slug || "").trim().toLowerCase();
  if (!s) return false;
  return RANGES_NOT_MANUFACTURERS.some((e) => e.slugs.includes(s));
}

export function canonicalRangeLabel(raw: string | null | undefined): string | null {
  return findRangeEntry(raw)?.rangeName || null;
}

/** Si le texte contient une de ces gammes, renvoyer le nom de gamme catalogue. */
export function matchRangeNotManufacturer(raw: string | null | undefined): string | null {
  const hay = compact(raw || "");
  if (!hay) return null;
  let best: { name: string; len: number } | null = null;
  for (const entry of RANGES_NOT_MANUFACTURERS) {
    for (const key of aliasKeys(entry)) {
      if (key.length >= 5 && hay.includes(key) && (!best || key.length > best.len)) {
        best = { name: entry.rangeName, len: key.length };
      }
    }
  }
  return best?.name || null;
}

export function isNonexistentBrandName(raw: string | null | undefined): boolean {
  const key = compact(raw || "");
  if (!key) return false;
  if (NONEXISTENT_BRAND_ALIASES.includes(key)) return true;
  const n = normalizeProductName(raw || "");
  return n === "ravzn juice" || n === "raven juice";
}

export function excludeRangesFromManufacturers<T extends { name: string; slug?: string }>(
  rows: T[]
): T[] {
  return rows.filter(
    (m) =>
      !isRangeNotManufacturerName(m.name) &&
      !isRangeNotManufacturerSlug(m.slug || "") &&
      !isNonexistentBrandName(m.name)
  );
}

/**
 * Marque / fabricant vs gamme pour l’inventaire.
 * Ne supprime ni ne fusionne de produit : reclasse seulement l’affichage.
 */
export function classifyInventoryBrandRange(input: {
  brand?: string | null;
  range?: string | null;
  manufacturerName?: string | null;
}): { brand: string | null; range: string | null } {
  const rangeIn = (input.range || "").trim() || null;
  if (
    isNonexistentBrandName(input.brand) ||
    isNonexistentBrandName(input.manufacturerName)
  ) {
    return { brand: null, range: rangeIn };
  }

  const mfr = (input.manufacturerName || "").trim() || null;
  const brandIn = (input.brand || "").trim() || null;
  const mfrOk =
    mfr && !isRangeNotManufacturerName(mfr) && !isNonexistentBrandName(mfr)
      ? mfr
      : null;
  const brandOk =
    brandIn &&
    !isRangeNotManufacturerName(brandIn) &&
    !isNonexistentBrandName(brandIn)
      ? brandIn
      : null;

  let range = rangeIn;
  if (!range) {
    if (brandIn && isRangeNotManufacturerName(brandIn)) {
      range = canonicalRangeLabel(brandIn) || brandIn;
    } else if (mfr && isRangeNotManufacturerName(mfr)) {
      range = canonicalRangeLabel(mfr) || mfr;
    }
  }

  return { brand: mfrOk || brandOk, range };
}

export const RANGES_NOT_MANUFACTURER_NAMES = RANGES_NOT_MANUFACTURERS.map(
  (e) => e.rangeName
);
