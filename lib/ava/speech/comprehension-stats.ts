/**
 * Stats anonymes de compréhension (pas de PII, pas d'auto-modification des règles).
 */
type Outcome = "success" | "failure";

type PatternStat = {
  pattern: string;
  intent: string;
  success: number;
  failure: number;
};

const MAX = 200;
const store = new Map<string, PatternStat>();

function keyOf(pattern: string, intent: string): string {
  return `${intent}::${pattern.replace(/\b[a-z]\./g, "").slice(0, 80)}`;
}

export function recordComprehensionPattern(input: {
  pattern: string;
  intent: string;
  outcome: Outcome;
}): void {
  const pattern = (input.pattern || "").replace(/\d{2,}/g, "#").trim();
  if (!pattern || pattern.length < 2) return;
  const k = keyOf(pattern, input.intent);
  const prev = store.get(k) || { pattern, intent: input.intent, success: 0, failure: 0 };
  if (input.outcome === "success") prev.success += 1;
  else prev.failure += 1;
  store.set(k, prev);
  if (store.size > MAX) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}

export function getComprehensionStats(): PatternStat[] {
  return [...store.values()].sort((a, b) => b.failure + b.success - (a.failure + a.success));
}

/** Patterns souvent ratés — à proposer en mise à jour suivante, jamais auto-appliqués. */
export function proposedComprehensionImprovements(): PatternStat[] {
  return getComprehensionStats().filter((s) => s.failure >= 3 && s.failure > s.success);
}
