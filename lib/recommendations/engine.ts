import type { FlavorTag, VapeProfileData } from "@/lib/vape-profile/types";

export interface ProductForScoring {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  brand: string | null;
  priceCents: number;
  promoPriceCents?: number | null;
  isPromo?: boolean;
  isNew?: boolean;
  stock: number;
}

export interface ScoredProduct {
  product: ProductForScoring;
  score: number;
  reason: string;
}

const FLAVOR_KEYWORDS: Record<FlavorTag, string[]> = {
  fruite: ["fruit", "framboise", "blue", "slush", "berry", "blueberry", "cerise", "pomme", "mangue", "ananas", "citron"],
  frais: ["frais", "menthe", "mint", "ice", "heisenberg", "fresh", "cool"],
  gourmand: ["gourmand", "tart", "lemon tart", "vanille", "caramel", "cookie", "dessert", "meringue", "choco"],
  classic: ["classic", "tabac", "ry4", "blond", "tobacco", "ry4"],
  boisson: ["cola", "energy", "café", "coffee", "the", "thé", "boisson", "drink"],
};

const DRAW_CATEGORIES: Record<string, string[]> = {
  serre: ["pods", "cigarettes-electroniques", "resistances"],
  aerien: ["box", "mods", "clearomiseurs"],
  mixte: ["pods", "box", "mods", "clearomiseurs", "cigarettes-electroniques"],
};

function detectProductFlavors(product: ProductForScoring): FlavorTag[] {
  const text = `${product.name} ${product.description ?? ""} ${product.brand ?? ""}`.toLowerCase();
  const found: FlavorTag[] = [];
  for (const [tag, keywords] of Object.entries(FLAVOR_KEYWORDS) as [FlavorTag, string[]][]) {
    if (keywords.some((k) => text.includes(k))) found.push(tag);
  }
  return found;
}

function effectivePrice(p: ProductForScoring): number {
  return p.isPromo && p.promoPriceCents ? p.promoPriceCents : p.priceCents;
}

export function scoreProduct(product: ProductForScoring, profile: VapeProfileData): ScoredProduct {
  let score = 0;
  const reasons: string[] = [];
  const flavors = detectProductFlavors(product);

  if (product.stock <= 0) {
    return { product, score: -100, reason: "Rupture de stock" };
  }

  for (const pref of profile.preferredFlavors) {
    if (flavors.includes(pref)) {
      score += 25;
      reasons.push(`saveur ${pref}`);
    }
  }

  for (const avoid of profile.avoidedFlavors) {
    if (flavors.includes(avoid)) {
      score -= 40;
      reasons.push(`évite ${avoid}`);
    }
  }

  if (profile.drawPreference) {
    const cats = DRAW_CATEGORIES[profile.drawPreference] ?? [];
    if (cats.includes(product.category)) {
      score += 15;
      reasons.push(`adapté tirage ${profile.drawPreference}`);
    }
  }

  if (product.isNew) {
    score += 20;
    reasons.push("nouveauté");
  }

  if (profile.averageBudgetCents && effectivePrice(product) <= profile.averageBudgetCents) {
    score += 10;
    reasons.push("dans votre budget");
  } else if (profile.averageBudgetCents && effectivePrice(product) > profile.averageBudgetCents * 1.3) {
    score -= 10;
  }

  if (profile.triedProductIds.includes(product.id)) {
    score -= 5;
  }

  if (product.category === "e-liquides" && profile.advisedNicotineMg) {
    const text = `${product.name} ${product.description ?? ""}`;
    const mgMatch = text.match(/(\d+)\s*mg/i);
    if (mgMatch) {
      const mg = parseInt(mgMatch[1], 10);
      const diff = Math.abs(mg - profile.advisedNicotineMg);
      if (diff <= 3) {
        score += 12;
        reasons.push(`nicotine ~${profile.advisedNicotineMg} mg`);
      }
    } else if (profile.advisedNicotineMg <= 6) {
      score += 5;
      reasons.push("e-liquide compatible débutant");
    }
  }

  return {
    product,
    score,
    reason: reasons.length > 0 ? reasons.join(", ") : "produit compatible",
  };
}

export function getPersonalizedRecommendations(
  products: ProductForScoring[],
  profile: VapeProfileData,
  options: { limit?: number; newOnly?: boolean } = {}
): ScoredProduct[] {
  if (!profile.personalizedEnabled || !profile.gdprConsent) return [];

  let pool = products.filter((p) => p.stock > 0);
  if (options.newOnly) pool = pool.filter((p) => p.isNew);

  return pool
    .map((p) => scoreProduct(p, profile))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 6);
}

export function buildGreetingMessage(
  profile: VapeProfileData,
  firstName?: string | null,
  topNew?: ScoredProduct | null
): string {
  const name = firstName ? `${firstName}` : "Bonjour";
  const flavors = profile.preferredFlavors.length
    ? flavorLabelsFr(profile.preferredFlavors)
    : "nos e-liquides";
  const draw = profile.drawPreference
    ? profile.drawPreference === "serre" ? "un tirage serré" : profile.drawPreference === "aerien" ? "un tirage aérien" : "un tirage mixte"
    : "votre style de vape";

  let msg = `${name}, d'après vos préférences, vous aimez les saveurs ${flavors} avec ${draw}. `;

  if (topNew) {
    msg += `Nous avons une nouveauté qui pourrait vous plaire : ${topNew.product.name}. `;
  }

  msg += "Ces conseils sont indicatifs et ne remplacent pas l'avis de nos experts en boutique.";
  return msg;
}

function flavorLabelsFr(tags: FlavorTag[]): string {
  const map: Record<FlavorTag, string> = {
    fruite: "fruitées",
    frais: "fraîches",
    gourmand: "gourmandes",
    classic: "classic",
    boisson: "boisson",
  };
  return tags.map((t) => map[t]).join(" et ");
}

export { detectProductFlavors };
