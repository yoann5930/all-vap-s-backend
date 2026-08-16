import type {
  AvaConversationContext,
  AvaFlavorFamily,
  AvaSearchCriteria,
  FreshnessPref,
} from "./types";
import { emptyConversationContext } from "./types";
import { parseDeviceFromMessage } from "./conversation-engine";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

const FLAVOR_SYNONYMS: Array<{ family: AvaFlavorFamily; terms: string[] }> = [
  {
    family: "fruits_rouges",
    terms: [
      "fruits rouges",
      "fruit rouge",
      "fraise",
      "framboise",
      "cassis",
      "mure",
      "myrtille",
      "groseille",
      "cerise",
      "berry",
      "fraise tagada",
    ],
  },
  {
    family: "agrumes",
    terms: ["agrume", "citron", "orange", "pamplemousse", "lime", "bergamote"],
  },
  {
    family: "exotique",
    terms: ["exotique", "mangue", "ananas", "passion", "papaye", "kiwi", "coco", "litchi"],
  },
  {
    family: "gourmand",
    terms: [
      "gourmand",
      "vanille",
      "caramel",
      "biscuit",
      "custard",
      "creme",
      "patisserie",
      "dessert",
      "cookie",
      "tarte",
      "chocolat",
    ],
  },
  {
    family: "menthe",
    terms: ["menthe", "menthol", "mint", "chlorophylle"],
  },
  {
    family: "tabac",
    terms: ["tabac", "classic", "ry4", "blond", "tobacco"],
  },
  {
    family: "boisson",
    terms: ["boisson", "cola", "energy", "cafe", "the", "soda"],
  },
  {
    family: "fruite",
    terms: ["fruite", "fruit", "fruits"],
  },
  {
    family: "frais",
    terms: ["frais", "fraicheur", "ice", "freeze", "glace", "fresh", "cool"],
  },
];

export function parseNicotineMg(text: string): number | null {
  const m =
    text.match(/(\d+(?:[.,]\d+)?)\s*mg\b/i) ||
    text.match(/\ben\s+(\d+(?:[.,]\d+)?)\b(?!\s*ml)/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseVolumeMl(text: string): number | null {
  const m = text.match(/(\d+)\s*ml\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseFreshness(text: string): FreshnessPref {
  const t = norm(text);
  // Négations / atténuations en premier (« pas trop frais » ≠ avec fraîcheur)
  if (
    /pas\s+trop\s+(de\s+)?(frais|fraicheur)/.test(t) ||
    /peu\s+(de\s+)?(frais|fraicheur)/.test(t) ||
    /sans\s+(frais|fraicheur|glace|ice|menthol|freeze)/.test(t) ||
    /pas\s+(de\s+)?(frais|fraicheur)/.test(t) ||
    /non\s+frais|pas\s+frais|sans\s+glace/.test(t) ||
    /plutot\s+(sucre|naturel)|plus\s+naturel|pas\s+glace/.test(t)
  ) {
    return "without";
  }
  if (
    /avec\s+(frais|fraicheur|menthol|ice)/.test(t) ||
    /extra\s+frais|bien\s+frais|tres\s+frais/.test(t)
  ) {
    return "with";
  }
  if (/fruits?\s+rouges?\s+frais/.test(t) || /frais\s+(et\s+)?fruite/.test(t)) {
    return "with";
  }
  if (/\bfraicheur\b|\bice\b|\bfreeze\b|\bmenthol\b/.test(t)) {
    return "with";
  }
  if (/\bfrais\b/.test(t) && !/fruit|fraise|framboise/.test(t)) {
    return "with";
  }
  return null;
}

/** Réponse courte qui affine seulement la fraîcheur (contexte précédent). */
export function isFreshnessFollowUp(text: string): boolean {
  const t = norm(text).trim();
  if (t.length > 48) return false;
  if (/liquide|e-?liquid|cherche|montre|trouve|veux|voudrais/.test(t)) return false;
  return (
    /frais|fraicheur|glace|ice|naturel|sucre/.test(t) ||
    /avec|sans/.test(t)
  );
}

export function parseFlavorFamily(text: string): {
  family: AvaFlavorFamily;
  terms: string[];
} {
  const t = norm(text);
  const terms: string[] = [];
  let family: AvaFlavorFamily = null;

  for (const group of FLAVOR_SYNONYMS) {
    for (const term of group.terms) {
      if (t.includes(norm(term))) {
        terms.push(term);
        if (!family || group.family === "fruits_rouges" || group.family === "gourmand") {
          // Priorité familles spécifiques
          if (group.family !== "frais" && group.family !== "fruite") {
            family = group.family;
          } else if (!family) {
            family = group.family;
          }
        }
      }
    }
  }

  // fruits rouges prioritaire sur fruite générique
  if (terms.some((x) => /fruit.?rouge|fraise|framboise|cassis|myrtille|mure|cerise/.test(norm(x)))) {
    family = "fruits_rouges";
  }

  return { family, terms: [...new Set(terms)] };
}

export function parseCategory(text: string): string | null {
  const t = norm(text);
  if (/resistance|coil|mesh/.test(t)) return "resistances";
  if (/\bdiy\b|base\s+diy|arome/.test(t)) return "diy";
  if (/\bpuff\b|jetable/.test(t)) return "puff";
  if (/accu|batterie|18650|21700/.test(t)) return "accu";
  if (/chargeur/.test(t)) return "chargeurs";
  if (/clearomiseur|clearo|atomiseur/.test(t)) return "clearomiseurs";
  if (/pod\b|cigarette|kit|box|mod|materiel/.test(t)) return "materiel";
  if (/liquide|e-?liquid|eliquide|saveur|juice/.test(t)) return "e-liquides";
  return null;
}

/** Référence « le deuxième », « le premier », etc. */
export function parseProductReference(
  text: string,
  lastNames: string[]
): number | null {
  const t = norm(text);
  if (/premier|premiere|le\s+1\b|numero\s+1|n[°o]\s*1/.test(t)) return 0;
  if (/deuxieme|deuxième|second|le\s+2\b|numero\s+2|n[°o]\s*2/.test(t)) return 1;
  if (/troisieme|troisième|le\s+3\b|numero\s+3|n[°o]\s*3/.test(t)) return 2;
  if (
    lastNames.length > 0 &&
    /celui que vous (me )?(conseillez|recommandez)|le (modele |materiel )?que vous (me )?(conseillez|recommandez)|lequel .{0,32}(conseillez|recommandez)|vous me conseillez vraiment/.test(
      t,
    )
  ) {
    return 0;
  }
  for (let i = 0; i < lastNames.length; i++) {
    if (t.includes(norm(lastNames[i]))) return i;
  }
  if (/montre|ouvre|fiche|celui|celle/.test(t) && lastNames.length === 1) return 0;
  return null;
}

export function mergeContextFromMessage(
  prev: AvaConversationContext | null | undefined,
  message: string,
  preferredStoreId?: AvaConversationContext["preferredStoreId"]
): AvaSearchCriteria & { context: AvaConversationContext } {
  const base = prev ? { ...prev } : emptyConversationContext(preferredStoreId ?? null);
  if (preferredStoreId) base.preferredStoreId = preferredStoreId;
  base.turn = (base.turn || 0) + 1;

  const { family, terms } = parseFlavorFamily(message);
  const freshness = parseFreshness(message);
  const nicotineMg = parseNicotineMg(message);
  const volumeMl = parseVolumeMl(message);
  const category = parseCategory(message);
  const freshnessFollowUp = isFreshnessFollowUp(message) && Boolean(prev?.flavorFamily || prev?.lastQuestion);

  // Ne pas écraser fruits_rouges / fruite par « frais » sur une réponse courte de contexte
  if (
    family &&
    !(
      freshnessFollowUp &&
      (family === "frais" || family === "menthe") &&
      prev?.flavorFamily &&
      prev.flavorFamily !== "frais"
    )
  ) {
    base.flavorFamily = family;
  }
  if (terms.length && !freshnessFollowUp) {
    base.flavorTerms = [...new Set([...base.flavorTerms, ...terms])];
  } else if (terms.length && freshnessFollowUp) {
    const keep = terms.filter((x) => !/^(frais|fraicheur|ice|freeze)$/i.test(x));
    if (keep.length) base.flavorTerms = [...new Set([...base.flavorTerms, ...keep])];
  }
  if (freshness) base.freshness = freshness;
  if (nicotineMg != null) base.nicotineMg = nicotineMg;
  if (volumeMl != null) base.volumeMl = volumeMl;
  if (category) base.category = category;

  // Fabricant simple
  const brandMatch = message.match(
    /\b(e-?tasty|pulp|fruizee|liquideo|vaporesso|geekvape|lost\s*vape|elfbar|puff)\b/i
  );
  if (brandMatch) base.manufacturer = brandMatch[1];

  // Matériel exact + corrections (« non c'est une XROS 4 ») → remplace l’ancien modèle
  const deviceParsed = parseDeviceFromMessage(message);
  if (deviceParsed.deviceModel) {
    if (base.deviceModel && base.deviceModel !== deviceParsed.deviceModel) {
      base.superseded = {
        ...base.superseded,
        deviceModel: [...(base.superseded.deviceModel ?? []), base.deviceModel],
      };
    }
    base.deviceModel = deviceParsed.deviceModel;
    if (deviceParsed.manufacturer) {
      if (base.manufacturer && base.manufacturer !== deviceParsed.manufacturer) {
        base.superseded = {
          ...base.superseded,
          manufacturer: [...(base.superseded.manufacturer ?? []), base.manufacturer],
        };
      }
      base.manufacturer = deviceParsed.manufacturer;
    }
  }

  let needsClarification: AvaSearchCriteria["needsClarification"] = null;
  let clarificationQuestion: string | null = null;

  const t = norm(message);
  const hasExplicitLiquid = /(e-?liquide|liquide|eliquide)/.test(t);
  const hasSpecificFlavor =
    terms.some((x) =>
      /fraise|framboise|cassis|myrtille|mure|cerise|vanille|caramel|menthe|citron|mangue|ananas|tabac/.test(
        norm(x)
      )
    ) || /fraise|framboise|cassis|myrtille|menthe|vanille|citron|mangue/.test(t);
  const isVagueLiquid =
    /^(je\s+)?(cherche|veux|voudrais)\s+(un\s+)?(liquide|e-?liquide)\.?$/i.test(message.trim()) ||
    (Boolean(base.category === "e-liquides" || /liquide/.test(t)) &&
      !base.flavorFamily &&
      terms.length === 0 &&
      !family);

  if (isVagueLiquid && !base.flavorFamily) {
    needsClarification = "flavor";
    clarificationQuestion =
      "Bien sûr. Vous préférez plutôt un goût fruité, gourmand, mentholé ou classique ?";
    base.lastQuestion = clarificationQuestion;
  } else if (
    // Demande vague type « un fruit rouge » sans e-liquide ni saveur précise
    base.flavorFamily &&
    base.flavorFamily !== "frais" &&
    base.flavorFamily !== "menthe" &&
    !base.freshness &&
    freshness == null &&
    !hasExplicitLiquid &&
    !hasSpecificFlavor &&
    t.length < 55 &&
    !/mg\b|montre|trouve|affiche/.test(t)
  ) {
    needsClarification = "freshness";
    clarificationQuestion =
      "Bien sûr. Vous préférez quelque chose de frais, plutôt sucré, ou un goût de fruits rouges plus naturel ?";
    base.lastQuestion = clarificationQuestion;
  }

  if (
    (base.category === "resistances" || /resistance|coil/.test(t)) &&
    !base.deviceModel &&
    !/vaporesso|geekvape|voopoo|smok|aspire|innokin/i.test(message)
  ) {
    needsClarification = "device";
    clarificationQuestion =
      "Pour vous proposer une résistance compatible, pouvez-vous me préciser la marque et le modèle exact de votre appareil ?";
    base.lastQuestion = clarificationQuestion;
    base.deviceModel = null;
  }

  // Réponses courtes au contexte (fruité / sans fraîcheur) → enchaîner la recherche
  if (prev?.lastQuestion || freshnessFollowUp) {
    if (/fruit[ée]|frais|gourmand|menthol|classic|tabac|naturel|sucre/.test(t) && t.length < 48) {
      needsClarification = null;
      clarificationQuestion = null;
      base.lastQuestion = null;
    }
    if (/avec|sans|pas\s+trop/.test(t) && /frais|fraicheur|glace/.test(t)) {
      needsClarification = null;
      clarificationQuestion = null;
      base.lastQuestion = null;
    }
  }

  const criteria: AvaSearchCriteria = {
    rawQuery: message,
    category: base.category,
    flavorFamily: base.flavorFamily,
    flavorTerms: base.flavorTerms,
    freshness: base.freshness,
    nicotineMg: base.nicotineMg,
    volumeMl: base.volumeMl,
    manufacturer: base.manufacturer,
    range: null,
    deviceModel: base.deviceModel,
    needsClarification,
    clarificationQuestion,
  };

  return { ...criteria, context: base };
}
