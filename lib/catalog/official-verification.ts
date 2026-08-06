/**
 * Vérification officielle catalogue — Fabricant → Gamme → Produit.
 * Les listes Yoann = base de recherche uniquement, jamais intégration auto.
 */

export const OFFICIAL_VERIFICATION_STATUSES = [
  "OFFICIAL_CONFIRMED",
  "OFFICIAL_NOT_FOUND",
  "NEEDS_CONFIRMATION",
  "INACTIVE",
  "WRONG_MANUFACTURER",
  "PRODUCT_NOT_RANGE",
  "NAME_CORRECTION",
] as const;

export type OfficialVerificationStatus =
  (typeof OFFICIAL_VERIFICATION_STATUSES)[number];

export type OfficialVerificationMeta = {
  officialSourceUrl: string | null;
  officialManufacturerUrl: string | null;
  verifiedAt: string | null;
  verificationStatus: OfficialVerificationStatus;
};

/** Une gamme n’apparaît en catalogue public que si confirmée officiellement. */
export function isRangeCatalogEligible(params: {
  verificationStatus: string | null | undefined;
  catalogVisible?: boolean | null;
  isActive?: boolean | null;
  /** Legacy ProductRange.status */
  legacyStatus?: string | null;
}): boolean {
  if (params.isActive === false) return false;
  if (params.verificationStatus === "OFFICIAL_CONFIRMED") {
    return params.catalogVisible !== false;
  }
  // Transition : anciennes gammes "verifie" déjà en prod
  if (
    !params.verificationStatus ||
    params.verificationStatus === "NEEDS_CONFIRMATION"
  ) {
    return (
      params.legacyStatus === "verifie" && params.catalogVisible !== false
    );
  }
  return false;
}

export function statusLabelFr(status: OfficialVerificationStatus): string {
  switch (status) {
    case "OFFICIAL_CONFIRMED":
      return "CONFIRMÉE OFFICIELLEMENT";
    case "INACTIVE":
      return "CONFIRMÉE MAIS INACTIVE";
    case "OFFICIAL_NOT_FOUND":
      return "NON TROUVÉE SUR LE SITE OFFICIEL";
    case "WRONG_MANUFACTURER":
      return "APPARTIENT À UN AUTRE FABRICANT";
    case "PRODUCT_NOT_RANGE":
      return "SEMBLE ÊTRE UN PRODUIT ET NON UNE GAMME";
    case "NAME_CORRECTION":
      return "NOM À CORRIGER";
    case "NEEDS_CONFIRMATION":
    default:
      return "À CONFIRMER PAR YOANN";
  }
}

export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Lecture défensive (client Prisma parfois pas encore régénéré). */
export function readRangeOfficialGate(range: Record<string, unknown>): {
  verificationStatus: string | null;
  catalogVisible: boolean | null;
  isActive: boolean;
  legacyStatus: string | null;
} {
  return {
    verificationStatus:
      typeof range.verificationStatus === "string"
        ? range.verificationStatus
        : null,
    catalogVisible:
      typeof range.catalogVisible === "boolean" ? range.catalogVisible : null,
    isActive: range.isActive !== false,
    legacyStatus: typeof range.status === "string" ? range.status : null,
  };
}

/** Score simple de présence d’un nom de gamme dans un HTML officiel. */
export function scoreRangeMentionInHtml(
  html: string,
  proposedName: string
): { score: number; officialNameHint: string | null } {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ");
  const nHtml = normalizeForMatch(plain);
  const nName = normalizeForMatch(proposedName);
  if (!nName) return { score: 0, officialNameHint: null };
  if (nHtml.includes(nName)) {
    return { score: 100, officialNameHint: proposedName };
  }
  const tokens = nName.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return { score: 0, officialNameHint: null };
  const hits = tokens.filter((t) => nHtml.includes(t)).length;
  const score = Math.round((hits / tokens.length) * 80);
  return {
    score,
    officialNameHint: score >= 60 ? proposedName : null,
  };
}
