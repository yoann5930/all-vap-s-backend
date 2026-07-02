import type { DrawPreference, FlavorTag, VapeProfileData, VapeStatus } from "@/lib/vape-profile/types";

export const SALES_STEPS = [
  {
    id: 0,
    question:
      "Bonjour, je suis votre conseiller virtuel All Vap's. Avant de commencer : confirmez-vous avoir 18 ans ou plus ? (Vente réservée aux majeurs — aucun conseil médical.)",
    suggestions: ["Oui, j'ai 18 ans ou plus", "Non"],
  },
  {
    id: 1,
    question: "Quel matériel utilisez-vous actuellement ?",
    suggestions: ["Pod / cigarette compacte", "Box / mod", "Je débute sans matériel", "Autre matériel"],
  },
  {
    id: 2,
    question: "Quel taux de nicotine utilisez-vous actuellement (ou souhaitez-vous) ?",
    suggestions: ["0 mg", "3 mg", "6 mg", "12 mg", "18 mg", "Je ne sais pas"],
  },
  {
    id: 3,
    question: "Quelles saveurs préférez-vous ?",
    suggestions: ["Fruité", "Frais / mentholé", "Gourmand", "Classic / tabac", "Plusieurs saveurs"],
  },
  {
    id: 4,
    question: "Que recherchez-vous en priorité ?",
    suggestions: ["Plus de hit (sensation en gorge)", "Plus de vapeur", "Plus de saveur"],
  },
  {
    id: 5,
    question: "Souhaitez-vous un conseil débutant ou confirmé ?",
    suggestions: ["Débutant", "Vapoteur confirmé"],
  },
] as const;

export const AGE_REFUSAL =
  "Désolé, All Vap's ne peut conseiller qu'aux personnes majeures (+18 ans). Rendez-vous en boutique avec un parent si besoin d'information générale.";

export function parseStepAnswer(step: number, message: string): Partial<VapeProfileData> & { material?: string; priority?: string } {
  const text = message.toLowerCase();
  const updates: Partial<VapeProfileData> & { material?: string; priority?: string } = {};

  if (step === 1) {
    if (/pod|compact|aio|starter/i.test(text)) updates.material = "pod";
    else if (/box|mod|sub.?ohm|puissant/i.test(text)) updates.material = "box";
    else if (/d[ée]but|sans|aucun|commence|nouveau/i.test(text)) {
      updates.material = "debut";
      updates.status = "debutant";
    } else updates.material = "autre";
  }

  if (step === 2) {
    if (/ne sais pas|pas s[ûu]r|conseil/i.test(text)) {
      updates.advisedNicotineMg = 6;
      updates.usedNicotineMg = 6;
    } else {
      const nicMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mg/i) || text.match(/^(\d+)/);
      if (nicMatch) {
        const mg = Math.round(parseFloat(nicMatch[1].replace(",", ".")));
        updates.usedNicotineMg = mg;
        updates.advisedNicotineMg = mg;
      }
    }
  }

  if (step === 3) {
    const preferred: FlavorTag[] = [];
    if (/fruit/i.test(text)) preferred.push("fruite");
    if (/frais|menthol/i.test(text)) preferred.push("frais");
    if (/gourmand/i.test(text)) preferred.push("gourmand");
    if (/classic|tabac|blond/i.test(text)) preferred.push("classic");
    if (/plusieurs|mix|vari/i.test(text)) preferred.push("fruite", "frais", "gourmand");
    if (preferred.length) updates.preferredFlavors = preferred;
  }

  if (step === 4) {
    if (/hit|gorge|mtl|serr/i.test(text)) {
      updates.priority = "hit";
      updates.drawPreference = "serre";
    } else if (/vapeur|nuage|dl|a[ée]rien|cloud/i.test(text)) {
      updates.priority = "vapeur";
      updates.drawPreference = "aerien";
    } else if (/saveur|go[ûu]t|ar[ôo]me/i.test(text)) {
      updates.priority = "saveur";
      updates.drawPreference = "mixte";
    }
  }

  if (step === 5) {
    if (/d[ée]but/i.test(text)) updates.status = "debutant";
    if (/confirm/i.test(text)) updates.status = "confirme";
  }

  return updates;
}

export function isAgeConfirmed(message: string): boolean | null {
  const text = message.toLowerCase();
  if (/^non\b|mineur|moins de 18|pas 18|< 18/.test(text)) return false;
  if (/^oui|yes|18|majeur|confirm/.test(text)) return true;
  return null;
}

export function getStepQuestion(step: number): (typeof SALES_STEPS)[number] | null {
  return SALES_STEPS.find((s) => s.id === step) ?? null;
}

export function buildCompletionMessage(
  profile: Partial<VapeProfileData>,
  productNames: string[]
): string {
  const parts: string[] = [
    "Parfait ! Voici mon analyse personnalisée All Vap's :",
  ];

  if (profile.drawPreference === "serre") parts.push("• Tirage serré recommandé pour un hit prononcé.");
  if (profile.drawPreference === "aerien") parts.push("• Tirage aérien idéal pour de belles vapeurs.");
  if (profile.drawPreference === "mixte") parts.push("• Profil polyvalent privilégiant les saveurs.");

  if (profile.advisedNicotineMg != null) {
    parts.push(`• Nicotine conseillée : environ ${profile.advisedNicotineMg} mg.`);
  }

  if (profile.preferredFlavors?.length) {
    parts.push(`• Saveurs adaptées : ${profile.preferredFlavors.join(", ")}.`);
  }

  if (productNames.length) {
    parts.push(`\nNos suggestions : ${productNames.join(", ")}.`);
  } else {
    parts.push("\nExplorez notre boutique — nos experts en magasin affineront le conseil.");
  }

  parts.push(
    "\n⚠️ Conseils indicatifs, pas un avis médical. Réservé aux +18 ans. Retrouvez-moi lors de votre prochaine visite pour les nouveautés !"
  );

  return parts.join("\n");
}

export function inferResumeStep(profile: VapeProfileData | null): number {
  if (!profile?.gdprConsent) return 0;
  if (!profile.drawPreference && profile.preferredFlavors.length === 0) return 1;
  if (profile.usedNicotineMg == null) return 2;
  if (profile.preferredFlavors.length === 0) return 3;
  if (!profile.drawPreference) return 4;
  return 5;
}

export function returningVisitorGreeting(firstName: string | null, hasNewProducts: boolean): string {
  const name = firstName ? `${firstName}, ` : "";
  if (hasNewProducts) {
    return `${name}content de vous revoir ! J'ai repéré de nouvelles saveurs qui pourraient vous plaire. On refait le point ?`;
  }
  return `${name}ravi de vous retrouver chez All Vap's ! Souhaitez-vous mettre à jour vos préférences ou découvrir nos nouveautés ?`;
}
