/**
 * Politique OBLIGATOIRE — e-liquides All Vap's ↔ SumUp
 *
 * - Interdit d'inventer un nom, une photo, un EAN, une saveur.
 * - Nom affiché = nom SumUp, sauf titre fabricant vérifié (URL officielle).
 * - Photo = packshot officiel (site fabricant / source documentée) → imageStatus official|validated.
 * - Tout e-liquide en ligne DOIT avoir sumupProductId + sumupName + photo officielle.
 * - SumUp n'a pas d'API catalogue écriture : sync = SumUp → All Vap's (noms/IDs/stock)
 *   + photos officielles liées au même produit SumUp. Jamais inventer côté site.
 */
import { normalizeCatalogKey } from "./assert-no-duplicates";

export const ELIQUIDE_POLICY = {
  code: "official_sumup_sync",
  version: 1,
} as const;

export type NameProvenance =
  | { kind: "sumup" }
  | { kind: "official"; sourceUrl: string; officialTitle: string };

export type EliquideGateInput = {
  category: string | null | undefined;
  productType?: string | null;
  volumeMl?: number | null;
  name: string;
  sumupName: string | null | undefined;
  sumupProductId: string | null | undefined;
  imageStatus: string | null | undefined;
  imageUrl?: string | null;
  priceCents?: number | null;
  /** Provenance nom : JSON dans sumupMapping ou override explicite */
  nameProvenance?: NameProvenance | null;
  sumupMapping?: string | null;
};

export type EliquideGateResult = {
  isEliquide: boolean;
  canPublishOnline: boolean;
  reasons: string[];
  /** Nom sûr à écrire en base (jamais inventé) */
  safeDisplayName: string | null;
  anomalies: string[];
};

const ELIQUIDE_CAT_RE = /e[-\s]?liquide|eliquide|liquide/i;
const FORMAT_TYPES = new Set(["10ml", "30ml", "50ml", "70ml", "100ml"]);

/** Stopwords pour comparer saveur / identité produit (pas le packaging). */
const NAME_STOP = new Set([
  "ml",
  "mg",
  "eliquide",
  "e",
  "liquide",
  "liquides",
  "one",
  "taste",
  "sels",
  "sel",
  "nicotine",
  "de",
  "du",
  "la",
  "le",
  "les",
  "et",
  "au",
  "aux",
  "en",
  "with",
  "by",
  "pack",
  "flacon",
  "booster",
  "shortfill",
  "0mg",
  "3mg",
  "6mg",
  "10mg",
  "12mg",
  "18mg",
  "20mg",
]);

export function isEliquideProduct(input: {
  category?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
}): boolean {
  if (input.productType && FORMAT_TYPES.has(input.productType)) return true;
  if (input.volumeMl && [10, 30, 50, 70, 100].includes(input.volumeMl)) return true;
  if (input.category && ELIQUIDE_CAT_RE.test(input.category)) return true;
  return false;
}

export function parseNameProvenance(
  sumupMapping: string | null | undefined,
  explicit?: NameProvenance | null
): NameProvenance {
  if (explicit) return explicit;
  if (!sumupMapping) return { kind: "sumup" };
  try {
    const j = JSON.parse(sumupMapping) as {
      nameSource?: string;
      nameSourceUrl?: string;
      officialTitle?: string;
    };
    if (
      j.nameSource === "official" &&
      j.nameSourceUrl &&
      /^https?:\/\//i.test(j.nameSourceUrl) &&
      j.officialTitle?.trim()
    ) {
      return {
        kind: "official",
        sourceUrl: j.nameSourceUrl,
        officialTitle: j.officialTitle.trim(),
      };
    }
  } catch {
    /* plain string mapping */
  }
  const m = sumupMapping.match(
    /^official\|(https?:\/\/[^\|]+)\|(.+)$/i
  );
  if (m) {
    return { kind: "official", sourceUrl: m[1], officialTitle: m[2].trim() };
  }
  return { kind: "sumup" };
}

export function encodeOfficialNameProvenance(
  sourceUrl: string,
  officialTitle: string
): string {
  return JSON.stringify({
    nameSource: "official",
    nameSourceUrl: sourceUrl,
    officialTitle,
  });
}

function tokenSet(name: string): Set<string> {
  const raw = normalizeCatalogKey(name)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NAME_STOP.has(t) && !/^\d+$/.test(t));
  return new Set(raw);
}

/**
 * Vérifie que le nom affiché ne change pas l'identité produit vs SumUp
 * (interdit : autre saveur, autre gamme inventée).
 */
export function namesAreCompatible(
  displayName: string,
  sumupName: string
): boolean {
  const a = tokenSet(displayName);
  const b = tokenSet(sumupName);
  if (a.size === 0 || b.size === 0) return false;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap += 1;
  if (overlap < 1) return false;
  const minSize = Math.min(a.size, b.size);
  const maxSize = Math.max(a.size, b.size);
  const union = a.size + b.size - overlap;
  const jaccard = overlap / union;
  // Le plus petit ensemble doit être quasi contenu, ou Jaccard ≥ 0.6
  const smallerContained = overlap >= minSize;
  return smallerContained || (jaccard >= 0.6 && overlap / maxSize >= 0.5);
}

/**
 * Résout le nom affiché SANS invention.
 * - Provenance officielle vérifiée (URL) → titre fabricant
 * - Sinon → nom SumUp obligatoire
 */
export function resolveSafeDisplayName(params: {
  sumupName: string | null | undefined;
  currentName?: string | null;
  provenance?: NameProvenance | null;
}): { name: string | null; reason: string } {
  const provenance = params.provenance || { kind: "sumup" as const };
  if (provenance.kind === "official") {
    if (!provenance.sourceUrl || !/^https?:\/\//i.test(provenance.sourceUrl)) {
      return { name: null, reason: "source_officielle_url_invalide" };
    }
    if (!provenance.officialTitle.trim()) {
      return { name: null, reason: "titre_officiel_vide" };
    }
    if (params.sumupName && !namesAreCompatible(provenance.officialTitle, params.sumupName)) {
      return { name: null, reason: "titre_officiel_incompatible_sumup" };
    }
    return { name: provenance.officialTitle.trim(), reason: "official" };
  }
  const sumup = (params.sumupName || "").trim();
  if (!sumup) return { name: null, reason: "sumup_name_manquant" };
  return { name: sumup, reason: "sumup" };
}

export function hasOfficialProductImage(input: {
  imageStatus?: string | null;
  imageUrl?: string | null;
}): boolean {
  const st = (input.imageStatus || "").toLowerCase();
  if (st !== "official" && st !== "validated") return false;
  const url = input.imageUrl || "";
  if (!url.startsWith("/media/")) return false;
  return true;
}

/**
 * Gate publication e-liquide en ligne.
 * Échec → visibleOnline doit rester / passer à false.
 */
export function evaluateEliquidePublishGate(
  input: EliquideGateInput
): EliquideGateResult {
  const isEliquide = isEliquideProduct(input);
  if (!isEliquide) {
    return {
      isEliquide: false,
      canPublishOnline: true,
      reasons: [],
      safeDisplayName: input.name,
      anomalies: [],
    };
  }

  const reasons: string[] = [];
  const anomalies: string[] = [];
  const provenance = parseNameProvenance(input.sumupMapping, input.nameProvenance);

  if (!input.sumupProductId) {
    reasons.push("sumup_product_id_manquant");
    anomalies.push("hors_sumup");
  }
  if (!input.sumupName?.trim()) {
    reasons.push("sumup_name_manquant");
    anomalies.push("sumup_name_manquant");
  }
  if ((input.priceCents ?? 0) <= 0) {
    reasons.push("prix_manquant");
    anomalies.push("prix_manquant");
  }
  if (!hasOfficialProductImage(input)) {
    reasons.push("photo_officielle_manquante");
    anomalies.push("photo_officielle_a_completer");
  }

  const resolved = resolveSafeDisplayName({
    sumupName: input.sumupName,
    currentName: input.name,
    provenance,
  });
  if (!resolved.name) {
    reasons.push(resolved.reason);
    anomalies.push(resolved.reason);
  } else if (
    provenance.kind === "sumup" &&
    input.name.trim() &&
    input.sumupName?.trim() &&
    normalizeCatalogKey(input.name) !== normalizeCatalogKey(input.sumupName)
  ) {
    // Affichage ≠ SumUp sans preuve officielle → aligner sur SumUp (pas un blocage photo/ID)
    anomalies.push(
      namesAreCompatible(input.name, input.sumupName)
        ? "nom_aligne_sumup_format"
        : "nom_invente_ou_incompatible_sumup"
    );
  }

  return {
    isEliquide: true,
    canPublishOnline: reasons.length === 0,
    reasons,
    safeDisplayName: resolved.name,
    anomalies: [...new Set(anomalies)],
  };
}

/** Helper pour scripts d'intégration : canPublish = gate OK. */
export function canPublishEliquideOnline(input: EliquideGateInput): boolean {
  return evaluateEliquidePublishGate(input).canPublishOnline;
}
