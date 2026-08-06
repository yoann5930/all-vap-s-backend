/**
 * Métadonnées Liquidarom — slugs, gammes, corrections officielles connues.
 */
import { slugify } from "@/lib/utils";

export type ImageVerificationStatus =
  | "verified"
  | "to_review"
  | "missing"
  | "discontinued"
  | "not_found"
  | "pending";

export type LiquidaromCorrespondence = {
  internalReference: string;
  currentSiteName: string;
  officialName: string;
  slug: string;
  range: string;
  rangeFolder: string;
  manufacturer: string;
  currentImage: string | null;
  finalImage: string | null;
  imageStatus: ImageVerificationStatus;
  officialSource: string | null;
  matchConfidence: "high" | "medium" | "low" | "manual";
  correctionRequired: boolean;
  notes: string | null;
};

/** Corrections validées ou à confirmer sur source fabricant */
export const OFFICIAL_NAME_HINTS: Record<string, { officialName?: string; status: ImageVerificationStatus; notes?: string }> = {
  "AV-0039": {
    officialName: "Ice Cool X - Mixed Red Berries",
    status: "to_review",
    notes: "Site officiel : Mixed Red Berries (pas Mixed Berries)",
  },
  "AV-0032": {
    status: "to_review",
    notes: "Gamme CSV Edition Collection — vérifier nom officiel Collector",
  },
  "AV-0012": { status: "to_review", notes: "Composition exacte à confirmer" },
  "AV-0014": { status: "to_review", notes: "Nom lu sur photo rayon" },
  "AV-0023": { status: "to_review", notes: "Composition exacte à confirmer" },
};

export function rangeFolderFromText(range: string): string {
  const r = range.toLowerCase();
  if (r.includes("ice cool x")) return "ice-cool-x";
  if (r.includes("ice cool")) return "ice-cool";
  if (r.includes("collègues") || r.includes("collegues")) return "les-collegues";
  if (r.includes("essentiels")) return "les-essentiels";
  if (r.includes("collector") || r.includes("collection")) return "collector";
  return "autres";
}

export function rangeSlugFromText(range: string): string {
  return rangeFolderFromText(range);
}

/** Slug produit stable — parfum uniquement, sans préfixe gamme */
export function productFlavorSlug(commercialName: string): string {
  const parts = commercialName.split(/\s*[-–—]\s*/);
  const flavorPart = parts.length > 1 ? parts.slice(1).join(" ") : commercialName;
  return slugify(flavorPart);
}

export function productPublicImagePath(params: {
  range: string;
  commercialName: string;
  thumb?: boolean;
}): string {
  const folder = rangeFolderFromText(params.range);
  const slug = productFlavorSlug(params.commercialName);
  const suffix = params.thumb ? "-thumb" : "";
  return `/images/products/liquidarom/${folder}/${slug}${suffix}.webp`;
}

export function resolveOfficialName(reference: string, commercialName: string): string {
  const hint = OFFICIAL_NAME_HINTS[reference];
  return hint?.officialName ?? commercialName;
}

export function imageStatusFromRow(notes: string | undefined, photoFace: string | undefined): ImageVerificationStatus {
  const n = (notes || "").toLowerCase();
  const photo = photoFace || "";
  if (/^image-\d+\.jpg$/i.test(photo)) return "missing";
  if (n.includes("à confirmer") || n.includes("confirmer") || n.includes("déduites")) return "to_review";
  if (n.includes("identification depuis photo")) return "to_review";
  return "to_review";
}

export function buildCorrespondence(row: Record<string, string>): LiquidaromCorrespondence {
  const ref = row["ID produit"] || row.reference || "";
  const currentName = row["Nom commercial"] || row.name || "";
  const range = row["Sous-catégorie"] || row.range || "";
  const officialName = resolveOfficialName(ref, currentName);
  const hint = OFFICIAL_NAME_HINTS[ref];
  const slug = productFlavorSlug(currentName);
  const finalImage = productPublicImagePath({ range, commercialName: currentName });
  const imgStatus = hint?.status ?? imageStatusFromRow(row["Notes internes"], row["Photo face"]);

  return {
    internalReference: ref,
    currentSiteName: currentName,
    officialName,
    slug,
    range,
    rangeFolder: rangeFolderFromText(range),
    manufacturer: "Liquidarom",
    currentImage: row["Photo face"] || null,
    finalImage: imgStatus === "missing" ? null : finalImage,
    imageStatus: imgStatus,
    officialSource: imgStatus === "verified" ? "https://www.liquidarom.com/" : null,
    matchConfidence: hint ? "medium" : "high",
    correctionRequired: Boolean(hint?.officialName || hint?.notes),
    notes: hint?.notes ?? row["Notes internes"] ?? null,
  };
}
