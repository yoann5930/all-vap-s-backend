/**
 * Base de connaissances problèmes matériels A.V.A.
 */
import fs from "node:fs";
import path from "node:path";

export type ProblemRisk = "faible" | "moyen" | "critique";

export type AvaProblemTemplate = {
  probleme_id: string;
  probleme: string;
  symptomes: string[];
  questions_de_diagnostic: string[];
  causes_probables: string[];
  controles_sans_risque: string[];
  solution_client: string;
  solution_boutique: string;
  niveau_risque: ProblemRisk | string;
  arret_immediat_recommande: boolean;
  statut_validation: string;
};

function loadJson<T>(rel: string, fallback: T): T {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function isExcludedBrandOrProduct(text: string): {
  excluded: boolean;
  reason: string | null;
} {
  const t = text.toLowerCase();
  if (/\bjnr\b/.test(t)) {
    return { excluded: true, reason: "La marque JNR n'est pas prise en charge par le diagnostic A.V.A." };
  }
  if (/\bpuff\b|\bjetable\b|\bdisposable\b|\bprérempli jetable\b|\bprerempli jetable\b/.test(t)) {
    return {
      excluded: true,
      reason: "Les puffs et produits jetables sont exclus du diagnostic A.V.A.",
    };
  }
  return { excluded: false, reason: null };
}

export function getProblemLibrary(): AvaProblemTemplate[] {
  const data = loadJson<{ problems: AvaProblemTemplate[] }>(
    "data/ava/problems/problems-library.json",
    { problems: [] },
  );
  return data.problems || [];
}

export function findProblemsBySymptoms(message: string): AvaProblemTemplate[] {
  // Import dynamique évite cycle sav-memory ↔ problems-knowledge
  const { matchSavProblems } = require("@/lib/ava/sav-memory") as typeof import("@/lib/ava/sav-memory");
  const hits = matchSavProblems(message, 5);
  if (hits.length) return hits;
  const lib = getProblemLibrary();
  const n = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return lib
    .filter((p) => {
      const blob = `${p.probleme} ${p.symptomes.join(" ")} ${p.probleme_id}`.toLowerCase();
      const keys = p.probleme_id.split("_");
      return keys.some((k) => k.length > 3 && n.includes(k)) || n.includes(blob.slice(0, 20));
    })
    .slice(0, 5);
}

export function getProblemsForDevice(manufacturer: string, model: string) {
  const lib = getProblemLibrary();
  const excl = isExcludedBrandOrProduct(`${manufacturer} ${model}`);
  if (excl.excluded) {
    return { excluded: true as const, reason: excl.reason, problems: [] as AvaProblemTemplate[] };
  }
  return {
    excluded: false as const,
    reason: null,
    manufacturer,
    model,
    problems: lib,
    note: "Fiches génériques : ne présenter comme certaines que celles VALIDÉES / notices officielles.",
  };
}

export function getKbSummary() {
  return loadJson("data/ava/problems/fiches-index.json", {
    fabricants: 0,
    modeles: 0,
    problemes_types: 0,
    fiches_totales: 0,
  });
}
