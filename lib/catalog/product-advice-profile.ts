/**
 * Profil de conseils métier par type produit — évite les templates e-liquide sur les concentrés.
 */

export type CanonicalProductKind =
  | "ELIQUID"
  | "NIC_SALT"
  | "DIY_CONCENTRATE"
  | "BASE"
  | "BOOSTER"
  | "DEVICE"
  | "COIL"
  | "POD"
  | "ACCESSORY"
  | "OTHER";

export interface ProductAdviceProfile {
  kind: CanonicalProductKind;
  showEliquidNicotineAdvice: boolean;
  showDilutionAdvice: boolean;
  faq: Array<{ q: string; a: string }>;
  tips: string[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

export function resolveCanonicalProductKind(input: {
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  name?: string | null;
  range?: string | null;
}): CanonicalProductKind {
  const blob = norm(
    [input.category, input.productType, input.format, input.name, input.range]
      .filter(Boolean)
      .join(" ")
  );

  if (/concentre|concentrate|arome\b|diy\b/.test(blob) && !/pret\s*a\s*vaper|ready\s*to\s*vape/.test(blob)) {
    return "DIY_CONCENTRATE";
  }
  if (/\bbase\b/.test(blob) && /diy|pg|vg|nicotine/.test(blob)) return "BASE";
  if (/booster|nicoboost/.test(blob)) return "BOOSTER";
  if (/sel\s*de\s*nicotine|nic\s*salt|salt\s*nic/.test(blob)) return "NIC_SALT";
  if (/resistance|coil|mesh/.test(blob)) return "COIL";
  if (/\bpod\b/.test(blob)) return "POD";
  if (/box|mod|kit|cigarette|clearomiseur|atomiseur/.test(blob)) return "DEVICE";
  if (/accesso|cable|drip|tank\b/.test(blob)) return "ACCESSORY";
  if (/e-?liquid|liquide|shortfill|longfill/.test(blob)) return "ELIQUID";
  return "OTHER";
}

export function getProductAdviceProfile(input: {
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  name?: string | null;
  range?: string | null;
  nicotineMg?: number | null;
}): ProductAdviceProfile {
  const kind = resolveCanonicalProductKind(input);

  if (kind === "DIY_CONCENTRATE") {
    return {
      kind,
      showEliquidNicotineAdvice: false,
      showDilutionAdvice: true,
      tips: [
        "Concentré aromatique — ne pas vaporiser pur.",
        "À diluer dans une base PG/VG adaptée.",
        "Dosage fabricant à vérifier sur l’étiquette ou la fiche officielle.",
        "Steep recommandé selon le fabricant (si documenté).",
      ],
      faq: [
        {
          q: "Puis-je vapoter ce concentré pur ?",
          a: "Non. Un concentré aromatique doit être dilué dans une base avant utilisation. Ne le vaporisez jamais pur.",
        },
        {
          q: "Quel dosage utiliser ?",
          a: "Dosage fabricant à vérifier. En l’absence d’indication fiable sur la fiche, demandez conseil en boutique All Vap's (Hautmont / Le Quesnoy).",
        },
        {
          q: "Faut-il ajouter de la nicotine ?",
          a: "La nicotine n’est présente que si vous ajoutez un booster/base nicotinée. Ce concentré n’est pas un e-liquide prêt à vaper.",
        },
      ],
    };
  }

  if (kind === "COIL") {
    return {
      kind,
      showEliquidNicotineAdvice: false,
      showDilutionAdvice: false,
      tips: [
        "Vérifiez la compatibilité exacte avec votre pod / clearomiseur.",
        "Respectez la plage de puissance indiquée.",
      ],
      faq: [
        {
          q: "Cette résistance est-elle compatible avec mon appareil ?",
          a: "Indiquez la marque et le modèle exact (ex. XROS 4, Drag 6). Une génération différente n’est pas forcément compatible.",
        },
      ],
    };
  }

  if (kind === "ELIQUID" || kind === "NIC_SALT") {
    return {
      kind,
      showEliquidNicotineAdvice: true,
      showDilutionAdvice: false,
      tips: [
        "Produit réservé aux adultes (+18 ans).",
        kind === "NIC_SALT"
          ? "Sels de nicotine : hit plus doux, souvent pour pods MTL."
          : "Vérifiez le ratio PG/VG selon votre matériel.",
      ],
      faq: [
        {
          q: "Quel taux de nicotine choisir ?",
          a: "Cela dépend de votre consommation et de votre matériel. Nos équipes All Vap's vous orientent en boutique — ce n’est pas un avis médical.",
        },
        {
          q: "Ce e-liquide convient-il à mon matériel ?",
          a: "Vérifiez le ratio PG/VG indiqué sur la fiche. Les ratios 50/50 conviennent souvent aux pods ; les ratios plus VG aux clearomiseurs plus ouverts.",
        },
        {
          q: "Puis-je le tester en boutique ?",
          a: "Oui, dans nos bar à vape de Hautmont et Le Quesnoy, nos conseillers peuvent vous proposer un test avant achat.",
        },
      ],
    };
  }

  return {
    kind,
    showEliquidNicotineAdvice: false,
    showDilutionAdvice: false,
    tips: ["Produit réservé aux adultes (+18 ans)."],
    faq: [
      {
        q: "Puis-je avoir un conseil en boutique ?",
        a: "Oui — Hautmont et Le Quesnoy. Nos équipes vous aident à choisir selon votre matériel.",
      },
    ],
  };
}

/** Recommandations « produits proches » : même type canonique uniquement. */
export function sameTypeRecommendations<T extends { id: string }>(
  current: T & {
    category?: string | null;
    productType?: string | null;
    name?: string | null;
    range?: string | null;
    format?: string | null;
  },
  candidates: Array<
    T & {
      category?: string | null;
      productType?: string | null;
      name?: string | null;
      range?: string | null;
      format?: string | null;
    }
  >
): T[] {
  const currentKind = resolveCanonicalProductKind(current);
  return candidates.filter((c) => {
    if (c.id === current.id) return false;
    return resolveCanonicalProductKind(c) === currentKind;
  });
}
