/**
 * Mémoire SAV A.V.A. — problèmes → contrôles → solutions client / boutique.
 * Fusionne problems-library.json + overlays sav-memory.json (aliases + étapes enrichies).
 */
import fs from "node:fs";
import path from "node:path";
import type { AvaProblemTemplate } from "@/lib/ava/problems-knowledge";

export type SavMemoryEntry = {
  probleme_id: string;
  aliases: string[];
  controles_sans_risque: string[];
  solution_client: string;
  solution_boutique: string;
  questions_de_diagnostic?: string[];
  arret_immediat_recommande?: boolean;
  niveau_risque?: string;
};

export type SavMatch = AvaProblemTemplate & {
  aliases: string[];
  matchScore: number;
};

function loadJson<T>(rel: string, fallback: T): T {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: { at: number; merged: SavMatch[] } | null = null;

export function getSavMemoryEntries(): SavMemoryEntry[] {
  const data = loadJson<{ entries: SavMemoryEntry[] }>(
    "data/ava/problems/sav-memory.json",
    { entries: [] }
  );
  return data.entries || [];
}

export function getMergedSavProblems(): SavMatch[] {
  const now = Date.now();
  if (cache && now - cache.at < 30_000) return cache.merged;

  const lib = loadJson<{ problems: AvaProblemTemplate[] }>(
    "data/ava/problems/problems-library.json",
    { problems: [] }
  ).problems || [];
  const overlays = getSavMemoryEntries();
  const byId = new Map(overlays.map((o) => [o.probleme_id, o]));

  const merged: SavMatch[] = lib.map((p) => {
    const o = byId.get(p.probleme_id);
    return {
      ...p,
      aliases: o?.aliases ?? [],
      controles_sans_risque: o?.controles_sans_risque?.length
        ? o.controles_sans_risque
        : p.controles_sans_risque,
      solution_client: o?.solution_client || p.solution_client,
      solution_boutique: o?.solution_boutique || p.solution_boutique,
      questions_de_diagnostic: o?.questions_de_diagnostic?.length
        ? o.questions_de_diagnostic
        : p.questions_de_diagnostic,
      arret_immediat_recommande:
        o?.arret_immediat_recommande ?? p.arret_immediat_recommande,
      niveau_risque: o?.niveau_risque || p.niveau_risque,
      matchScore: 0,
    };
  });

  // Entrées SAV sans fiche library
  for (const o of overlays) {
    if (merged.some((m) => m.probleme_id === o.probleme_id)) continue;
    merged.push({
      probleme_id: o.probleme_id,
      probleme: o.probleme_id,
      symptomes: o.aliases,
      questions_de_diagnostic: o.questions_de_diagnostic ?? [],
      causes_probables: [],
      controles_sans_risque: o.controles_sans_risque,
      solution_client: o.solution_client,
      solution_boutique: o.solution_boutique,
      niveau_risque: o.niveau_risque || "moyen",
      arret_immediat_recommande: Boolean(o.arret_immediat_recommande),
      statut_validation: "SAV_MEMORY",
      aliases: o.aliases,
      matchScore: 0,
    });
  }

  cache = { at: now, merged };
  return merged;
}

/** Score un message utilisateur contre la mémoire SAV. */
export function matchSavProblems(message: string, limit = 3): SavMatch[] {
  const n = norm(message);
  if (!n) return [];

  const scored = getMergedSavProblems()
    .map((p) => {
      let score = 0;
      const idParts = p.probleme_id.split("_");
      for (const part of idParts) {
        if (part.length > 3 && n.includes(part)) score += 2;
      }
      for (const a of p.aliases) {
        const an = norm(a);
        if (an.length >= 3 && n.includes(an)) score += 6;
      }
      for (const s of p.symptomes) {
        const sn = norm(s);
        if (sn.length >= 4 && n.includes(sn.slice(0, Math.min(18, sn.length)))) score += 3;
      }
      const title = norm(p.probleme);
      if (title.length >= 4 && n.includes(title.slice(0, 12))) score += 4;

      // Boosts fréquents boutique
      if (/check\s*atomizer|no\s*atomizer/.test(n) && p.probleme_id === "no_atomizer") score += 10;
      if (/fuit|leak|coule/.test(n) && p.probleme_id === "leak") score += 8;
      if (/brul|burnt|dry\s*hit/.test(n) && p.probleme_id === "burnt_taste") score += 8;
      if (/gonfl/.test(n) && p.probleme_id === "swollen_battery") score += 12;
      if (/chauffe|surchauff/.test(n) && p.probleme_id === "battery_heat") score += 10;
      if (/allume|demarre/.test(n) && p.probleme_id === "no_power") score += 6;
      if (/charge/.test(n) && p.probleme_id === "no_charge") score += 5;

      return { ...p, matchScore: score };
    })
    .filter((p) => p.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  return scored.slice(0, limit);
}

export function getSavById(problemeId: string): SavMatch | null {
  return getMergedSavProblems().find((p) => p.probleme_id === problemeId) ?? null;
}

/** Map symptom keys du flow générique → id mémoire SAV. */
export const SYMPTOM_TO_SAV_ID: Record<string, string> = {
  fuite: "leak",
  "gout-brule": "burnt_taste",
  "pas-vapeur": "pod_not_detected",
  charge: "no_charge",
  allumage: "no_power",
  generic: "error_code",
  atomizer: "no_atomizer",
};

export function resolveSavForSymptomKey(symptomKey: string): SavMatch | null {
  const id = SYMPTOM_TO_SAV_ID[symptomKey] || symptomKey;
  return getSavById(id) || matchSavProblems(symptomKey, 1)[0] || null;
}

export function getSafeChecksFromSav(
  symptomKeyOrMessage: string
): string[] {
  const byKey = resolveSavForSymptomKey(symptomKeyOrMessage);
  if (byKey?.controles_sans_risque?.length) return byKey.controles_sans_risque;
  const hit = matchSavProblems(symptomKeyOrMessage, 1)[0];
  return hit?.controles_sans_risque ?? [];
}

export function formatShopOrientation(sav: SavMatch | null): string {
  const base =
    "Après ces vérifications, le plus sûr est un contrôle en boutique avec votre appareil. Je ne déclare pas de panne définitive à distance.";
  if (!sav) return `${base} On peut aussi reprendre une étape si vous préférez.`;
  return `${base} En magasin : ${sav.solution_boutique} Aucune facture exigée pour un premier test.`;
}

export function formatClientSolution(sav: SavMatch | null): string {
  if (!sav) return "Effectuez les contrôles proposés. Si ça continue, on oriente vers la boutique.";
  return sav.solution_client;
}
