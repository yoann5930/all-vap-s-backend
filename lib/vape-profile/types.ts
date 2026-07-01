export type VapeStatus = "debutant" | "confirme";
export type DrawPreference = "serre" | "aerien" | "mixte";
export type FlavorTag = "fruite" | "frais" | "gourmand" | "classic" | "boisson";

export interface VapeProfileData {
  id?: string;
  userId?: string;
  status: VapeStatus;
  cigarettesPerDay: number | null;
  drawPreference: DrawPreference | null;
  preferredFlavors: FlavorTag[];
  avoidedFlavors: FlavorTag[];
  advisedNicotineMg: number | null;
  usedNicotineMg: number | null;
  advisedProductIds: string[];
  triedProductIds: string[];
  averageBudgetCents: number | null;
  gdprConsent: boolean;
  personalizedEnabled: boolean;
  lastRecommendationAt: string | null;
}

export const VAPE_STATUS_OPTIONS: Array<{ value: VapeStatus; label: string }> = [
  { value: "debutant", label: "Débutant" },
  { value: "confirme", label: "Vapoteur confirmé" },
];

export const DRAW_OPTIONS: Array<{ value: DrawPreference; label: string }> = [
  { value: "serre", label: "Tirage serré (MTL)" },
  { value: "aerien", label: "Tirage aérien (DL)" },
  { value: "mixte", label: "Mixte" },
];

export const FLAVOR_OPTIONS: Array<{ value: FlavorTag; label: string }> = [
  { value: "fruite", label: "Fruité" },
  { value: "frais", label: "Frais / Menthe" },
  { value: "gourmand", label: "Gourmand" },
  { value: "classic", label: "Classic / Tabac" },
  { value: "boisson", label: "Boisson" },
];

export const GDPR_CONSENT_TEXT =
  "J'accepte que All Vap's conserve mes préférences vape afin de personnaliser mes recommandations.";

export const MEDICAL_DISCLAIMER =
  "Les recommandations All Vap's sont indicatives et ne constituent pas un avis médical. La vape ne soigne ni ne guérit. Réservé aux +18 ans.";

export function emptyVapeProfile(): VapeProfileData {
  return {
    status: "debutant",
    cigarettesPerDay: null,
    drawPreference: null,
    preferredFlavors: [],
    avoidedFlavors: [],
    advisedNicotineMg: null,
    usedNicotineMg: null,
    advisedProductIds: [],
    triedProductIds: [],
    averageBudgetCents: null,
    gdprConsent: false,
    personalizedEnabled: true,
    lastRecommendationAt: null,
  };
}

export function statusLabel(status: VapeStatus): string {
  return VAPE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function drawLabel(draw: DrawPreference | null): string {
  if (!draw) return "—";
  return DRAW_OPTIONS.find((o) => o.value === draw)?.label ?? draw;
}

export function flavorLabels(tags: FlavorTag[]): string {
  return tags.map((t) => FLAVOR_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ") || "—";
}
