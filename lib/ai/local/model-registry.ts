import type { AvaEngineRole, EngineRoleAssignment } from "./types";

/**
 * Candidats par rôle — machine 24 Go :
 * Gemma 3 12B (principal) · Llama 3.1 8B (outils/JSON) · Llama 3.2 3B (rapide).
 * Un seul modèle chargé à la fois (OLLAMA_MAX_LOADED_MODELS=1).
 */
export const ENGINE_ROLE_ASSIGNMENTS: EngineRoleAssignment[] = [
  {
    role: "conversation",
    candidates: [
      "gemma3:12b",
      "llama3.1:8b",
      "qwen2.5:7b",
      "llama3.2:3b",
      "gemma3:4b",
      "qwen2.5:3b",
    ],
    minRamGb: 8,
    description: "Dialogue Admin naturel FR",
  },
  {
    role: "reasoning",
    candidates: [
      "gemma3:12b",
      "llama3.1:8b",
      "qwen2.5:7b",
      "llama3.2:3b",
      "qwen3:4b",
    ],
    minRamGb: 8,
    description: "Analyse administrative / raisonnement",
  },
  {
    role: "json_extract",
    candidates: [
      "llama3.1:8b",
      "qwen2.5-coder:7b",
      "qwen2.5:7b",
      "llama3.2:3b",
      "gemma3:12b",
    ],
    minRamGb: 6,
    description: "Extraction JSON / produits",
  },
  {
    role: "summary",
    candidates: ["llama3.2:3b", "qwen2.5:3b", "gemma2:2b", "llama3.1:8b", "qwen2.5:7b"],
    minRamGb: 3,
    description: "Résumés rapides / classification",
  },
  {
    role: "tool_call",
    candidates: [
      "llama3.1:8b",
      "llama3.2:3b",
      "qwen2.5:7b",
      "qwen2.5-coder:7b",
      "gemma3:12b",
    ],
    minRamGb: 6,
    description: "Intentions d'outils structurés",
  },
  {
    role: "reflection",
    candidates: [
      "gemma3:12b",
      "llama3.1:8b",
      "llama3.2:3b",
      "qwen2.5:7b",
    ],
    minRamGb: 6,
    description: "Synthèses métier structurées (réflexions)",
  },
];

/** Pull prioritaire machine ≥16–24 Go. */
export const SAFE_PULL_CANDIDATES_24GB = [
  "llama3.2:3b",
  "llama3.1:8b",
  "gemma3:12b",
] as const;

/** Petite config (≤8 Go) — ne pas puller 12B. */
export const SAFE_PULL_CANDIDATES = [
  "llama3.2:3b",
  "qwen2.5:3b",
  "gemma2:2b",
  "gemma3:1b",
] as const;

/** Benchmark ponctuel seulement — ne pas charger en permanence. */
export const BENCHMARK_ONLY_MODELS = ["mistral-small"] as const;

/** Trop lourds / ponctuels. */
export const FUTURE_UPGRADE_MODELS = [
  "mistral-small",
  "qwen2.5:14b",
  "qwen3:14b",
] as const;

export function roleAssignment(role: AvaEngineRole): EngineRoleAssignment {
  const found = ENGINE_ROLE_ASSIGNMENTS.find((a) => a.role === role);
  if (!found) {
    return ENGINE_ROLE_ASSIGNMENTS[0];
  }
  return found;
}

/** Normalise un nom Ollama (tag optionnel). */
export function modelMatches(installed: string, candidate: string): boolean {
  const a = installed.toLowerCase();
  const b = candidate.toLowerCase();
  if (a === b) return true;
  if (b.includes(":")) return a === b;
  return a === b || a.startsWith(b + ":");
}

export function pickInstalledModel(
  candidates: string[],
  installed: string[]
): { model: string; fallbacks: string[] } | null {
  for (const c of candidates) {
    if (installed.includes(c)) {
      const fallbacks = candidates.filter((x) => x !== c && installed.includes(x));
      return { model: c, fallbacks };
    }
  }
  for (const c of candidates) {
    if (c.includes(":")) continue;
    const hit = installed.find((i) => i === c || i.startsWith(c + ":"));
    if (hit) {
      const fallbacks = candidates
        .map((x) => (installed.includes(x) ? x : null))
        .filter((x): x is string => Boolean(x) && x !== hit);
      return { model: hit, fallbacks };
    }
  }
  return null;
}

/** Modèles à puller selon la RAM totale détectée. */
export function pullCandidatesForRam(totalRamGb: number): readonly string[] {
  if (totalRamGb >= 16) return SAFE_PULL_CANDIDATES_24GB;
  return SAFE_PULL_CANDIDATES;
}
