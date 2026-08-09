/**
 * Exact match matériel — jamais de substitution silencieuse XROS 4 → XROS 3.
 * Issu du pack Work 2026-08-09, adapté au dépôt.
 */

export interface CatalogEntity {
  id: string;
  name: string;
  aliases: string[];
}

export type MatchKind = "EXACT" | "ALIAS" | "FUZZY_CONFIRMATION" | "UNKNOWN";

export interface MatchResult {
  kind: MatchKind;
  entity?: CatalogEntity;
  /** Message à afficher si fuzzy / inconnu — jamais de substitution auto */
  confirmMessage?: string;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveEntity(query: string, entities: CatalogEntity[]): MatchResult {
  const q = norm(query);
  if (!q) return { kind: "UNKNOWN" };

  const exact = entities.find((e) => norm(e.name) === q);
  if (exact) return { kind: "EXACT", entity: exact };

  const alias = entities.find((e) => e.aliases.some((a) => norm(a) === q));
  if (alias) return { kind: "ALIAS", entity: alias };

  // Fuzzy volontairement non auto-appliqué : confirmation obligatoire
  const fuzzy = entities.find((e) => {
    const n = norm(e.name);
    return n.includes(q) || q.includes(n);
  });
  if (fuzzy) {
    return {
      kind: "FUZZY_CONFIRMATION",
      entity: fuzzy,
      confirmMessage: `Je trouve « ${fuzzy.name} » dans la base. C’est bien celui-là, ou un autre modèle exact ?`,
    };
  }

  return {
    kind: "UNKNOWN",
    confirmMessage:
      "Je ne trouve pas encore ce modèle exact dans la base. Je préfère vérifier avant de te conseiller.",
  };
}

/** Extrait un candidat modèle depuis un message libre (pour résolution catalogue). */
export function extractDeviceQuery(message: string): string | null {
  const t = norm(message);
  const m =
    t.match(/\b(vaporesso\s+)?xros\s*[234]?\b/) ||
    t.match(/\b(geekvape\s+)?aegis\s+legend\s*2?\b/) ||
    t.match(/\bdrag\s*[6s]?\s*2?\b/) ||
    t.match(/\bgen\s*\d+\b/);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}
