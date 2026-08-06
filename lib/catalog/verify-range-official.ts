/**
 * Vérifie une gamme proposée (liste Yoann) sur le site officiel du fabricant.
 * Ne crée / n’intègre JAMAIS automatiquement — retourne un statut uniquement.
 */
import {
  normalizeForMatch,
  scoreRangeMentionInHtml,
  type OfficialVerificationStatus,
} from "@/lib/catalog/official-verification";

export type RangeOfficialCheckInput = {
  proposedName: string;
  manufacturerName: string;
  manufacturerWebsite: string | null;
  /** Pages à scanner (catalogue gammes, home, etc.) */
  seedUrls?: string[];
  /** Alias / orthographes officielles alternatives (ex. Golf City → Godfall City) */
  searchAliases?: string[];
};

export type RangeOfficialCheckResult = {
  proposedName: string;
  verificationStatus: OfficialVerificationStatus;
  officialNameFound: string | null;
  officialSourceUrl: string | null;
  officialManufacturerUrl: string | null;
  verifiedAt: string;
  evidence: {
    checkedUrls: string[];
    bestScore: number;
    notes: string[];
  };
};

const UA =
  "Mozilla/5.0 (compatible; AllVapsCatalogBot/1.0; +official range verification)";

async function fetchText(url: string): Promise<{ ok: boolean; html: string; finalUrl: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    const html = await res.text();
    return { ok: res.ok, html, finalUrl: res.url };
  } catch {
    return { ok: false, html: "", finalUrl: url };
  }
}

function buildSeedUrls(website: string | null, extra?: string[]): string[] {
  const out: string[] = [];
  if (website) {
    try {
      const u = new URL(website);
      out.push(u.origin + "/");
      out.push(`${u.origin}/collections`);
      out.push(`${u.origin}/collections/all`);
      out.push(`${u.origin}/pages/marques`);
      out.push(`${u.origin}/marques`);
      out.push(`${u.origin}/gammes`);
    } catch {
      /* ignore */
    }
  }
  for (const e of extra || []) {
    if (e && !out.includes(e)) out.push(e);
  }
  return [...new Set(out)];
}

/**
 * Heuristique : si le nom ressemble à un produit unitaire (volume + nicotine),
 * probablement pas une gamme.
 */
export function looksLikeProductNotRange(name: string): boolean {
  const n = normalizeForMatch(name);
  if (/\b\d+\s*ml\b/.test(n) && /\b\d+\s*mg\b/.test(n)) return true;
  if (/\b\d+\s*ml\b/.test(n) && /\b(0|3|6|12|18|20)\b/.test(n)) return true;
  return false;
}

export async function verifyRangeOnOfficialSite(
  input: RangeOfficialCheckInput
): Promise<RangeOfficialCheckResult> {
  const verifiedAt = new Date().toISOString();
  const notes: string[] = [];
  const checkedUrls: string[] = [];

  if (looksLikeProductNotRange(input.proposedName)) {
    return {
      proposedName: input.proposedName,
      verificationStatus: "PRODUCT_NOT_RANGE",
      officialNameFound: null,
      officialSourceUrl: null,
      officialManufacturerUrl: input.manufacturerWebsite,
      verifiedAt,
      evidence: {
        checkedUrls: [],
        bestScore: 0,
        notes: ["Le nom proposé ressemble à un produit (volume/nicotine), pas une gamme."],
      },
    };
  }

  if (!input.manufacturerWebsite) {
    return {
      proposedName: input.proposedName,
      verificationStatus: "NEEDS_CONFIRMATION",
      officialNameFound: null,
      officialSourceUrl: null,
      officialManufacturerUrl: null,
      verifiedAt,
      evidence: {
        checkedUrls: [],
        bestScore: 0,
        notes: ["Pas d’URL site officiel fabricant — confirmation Yoann requise."],
      },
    };
  }

  const seeds = buildSeedUrls(input.manufacturerWebsite, input.seedUrls);
  let bestScore = 0;
  let bestUrl: string | null = null;
  let officialNameHint: string | null = null;
  const namesToScore = [
    input.proposedName,
    ...(input.searchAliases || []),
  ].filter(Boolean);

  for (const url of seeds.slice(0, 12)) {
    const page = await fetchText(url);
    checkedUrls.push(page.finalUrl || url);
    if (!page.ok || page.html.length < 200) {
      notes.push(`Page inaccessible ou vide: ${url}`);
      continue;
    }
    for (const candidate of namesToScore) {
      const { score, officialNameHint: hint } = scoreRangeMentionInHtml(
        page.html,
        candidate
      );
      if (score > bestScore) {
        bestScore = score;
        bestUrl = page.finalUrl || url;
        officialNameHint = hint;
      }
    }
  }

  let verificationStatus: OfficialVerificationStatus = "OFFICIAL_NOT_FOUND";
  if (bestScore >= 90) {
    verificationStatus = "OFFICIAL_CONFIRMED";
    notes.push("Mention forte du nom de gamme sur une page officielle.");
  } else if (bestScore >= 60) {
    verificationStatus = "NAME_CORRECTION";
    notes.push("Mention partielle — orthographe / nom exact à confirmer.");
  } else {
    notes.push("Aucune mention fiable trouvée sur les pages officielles scannées.");
    verificationStatus = "OFFICIAL_NOT_FOUND";
  }

  return {
    proposedName: input.proposedName,
    verificationStatus,
    officialNameFound: officialNameHint,
    officialSourceUrl: bestUrl,
    officialManufacturerUrl: input.manufacturerWebsite,
    verifiedAt,
    evidence: { checkedUrls, bestScore, notes },
  };
}
