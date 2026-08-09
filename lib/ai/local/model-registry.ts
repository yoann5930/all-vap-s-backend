import type { AvaEngineRole, EngineRoleAssignment } from "./types";

/**
 * Candidats par rôle — du plus léger / spécialisé au plus lourd.
 * Aucun gros modèle (>10 Go) n'est imposé : ils restent optionnels pour upgrade matériel.
 */
export const ENGINE_ROLE_ASSIGNMENTS: EngineRoleAssignment[] = [
  {
    role: "conversation",
    candidates: [
      "qwen2.5:7b",
      "llama3.2:3b",
      "llama3.1:8b",
      "gemma3:4b",
      "gemma2:2b",
      "qwen2.5:3b",
      "qwen3:4b",
    ],
    minRamGb: 4,
    description: "Dialogue Admin naturel FR",
  },
  {
    role: "reasoning",
    candidates: [
      "qwen2.5:7b",
      "llama3.1:8b",
      "qwen3:4b",
      "llama3.2:3b",
      "deepseek-coder-v2:latest",
    ],
    minRamGb: 5,
    description: "Analyse administrative / raisonnement",
  },
  {
    role: "json_extract",
    candidates: [
      "qwen2.5:7b",
      "qwen2.5-coder:7b",
      "llama3.2:3b",
      "qwen2.5-coder:14b",
      "llama3.1:8b",
    ],
    minRamGb: 4,
    description: "Extraction JSON / produits",
  },
  {
    role: "summary",
    candidates: ["llama3.2:3b", "qwen2.5:3b", "gemma2:2b", "qwen2.5:7b", "llama3.1:8b"],
    minRamGb: 3,
    description: "Résumés rapides",
  },
  {
    role: "tool_call",
    candidates: [
      "llama3.2:3b",
      "qwen2.5:7b",
      "qwen2.5-coder:7b",
      "llama3.1:8b",
      "qwen3:4b",
    ],
    minRamGb: 4,
    description: "Intentions d'outils structurés",
  },
  {
    role: "reflection",
    candidates: ["qwen2.5:7b", "llama3.1:8b", "llama3.2:3b", "qwen3:4b"],
    minRamGb: 4,
    description: "Synthèses métier structurées (réflexions)",
  },
];

/** Modèles à puller en priorité sur petite config (ne pas puller 14B+). */
export const SAFE_PULL_CANDIDATES = [
  "llama3.2:3b",
  "qwen2.5:3b",
  "gemma2:2b",
  "gemma3:1b",
] as const;

/** Trop lourds pour 8 Go — réservés à l'évolution matérielle. */
export const FUTURE_UPGRADE_MODELS = [
  "mistral-small",
  "qwen2.5:14b",
  "qwen3:14b",
  "gemma3:12b",
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
  // exact tag required when candidate has a tag
  if (b.includes(":")) return a === b;
  return a === b || a.startsWith(b + ":");
}

export function pickInstalledModel(
  candidates: string[],
  installed: string[]
): { model: string; fallbacks: string[] } | null {
  // Prefer exact tag matches first
  for (const c of candidates) {
    if (installed.includes(c)) {
      const fallbacks = candidates.filter((x) => x !== c && installed.includes(x));
      return { model: c, fallbacks };
    }
  }
  // Then family-only candidates (no tag)
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
