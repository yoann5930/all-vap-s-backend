/**
 * Sélection d'outils Admin — matching FR robuste (accents) + contexte conversationnel.
 * Évite les regex \b fragiles sur les mots accentués (cause du bug « rapports »).
 */
import type { AvaAdminToolName, AvaAdminToolPlan } from "./types";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’ʼ]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(norm(n)));
}

function detectStore(n: string): string | null {
  if (hasAny(n, ["hautmont"])) return "Hautmont";
  if (hasAny(n, ["quesnoy", "le quesnoy"])) return "Le Quesnoy";
  return null;
}

function detectLimit(n: string): number | null {
  const m = n.match(/\b(top\s*)?(\d{1,2})\b/) || n.match(/\b(\d{1,2})\s*(plus|plus\s+urgents?|urgents?)\b/);
  if (m) {
    const num = Number(m[2] || m[1]);
    if (Number.isFinite(num) && num > 0 && num <= 40) return num;
  }
  if (hasAny(n, ["plus urgents", "les plus urgents", "urgent"])) return 10;
  return null;
}

function isGreeting(n: string): boolean {
  return /^(cc|bonjour|bonsoir|salut|hey|hello|hi|coucou)(\s+(yoann|ava))?(\s*[!?]*)?$/.test(n);
}

function isSocialChitchat(n: string): boolean {
  return (
    isGreeting(n) ||
    /^(ca va|comment ca va|tu vas bien|ca roule|et toi)(\s*[!?]*)?$/.test(n) ||
    /^(quoi de neuf|quoi de beau|on parle un peu|on discute)(\s*[!?]*)?$/.test(n) ||
    /^(oui tranquille|tranquille|oui et toi|oui ca va)(\s*[!?]*)?$/.test(n) ||
    /^je suis (creve|fatigue)( aujourd ?hui)?(\s*[!?]*)?$/.test(n)
  );
}

function isThanks(n: string): boolean {
  return /^(merci|thanks|nickel|super|parfait|ok|d accord)[!?.]*$/.test(n);
}

function isCapabilities(n: string): boolean {
  return hasAny(n, [
    "que peux-tu",
    "que peux tu",
    "tu peux faire",
    "tes capacites",
    "aide-moi",
    "aide moi",
    "help",
    "que sais-tu faire",
    "comment tu marches",
  ]);
}

function isFullReport(n: string): boolean {
  return (
    hasAny(n, [
      "tous les rapports",
      "tout les rapports",
      "rapport complet",
      "rapports complets",
      "rapport global",
      "fais-moi un rapport",
      "fais moi un rapport",
      "donne-moi tous",
      "donne moi tous",
      "peux-tu me donner tous",
      "peux tu me donner tous",
      "resume-moi tout",
      "resume moi tout",
      "point complet",
      "vue d ensemble",
      "vue densemble",
      "qu est-ce qui se passe",
      "qu est ce qui se passe",
      "fais-moi le point",
      "fais moi le point",
      "le point du jour",
      "point du jour",
    ]) ||
    (hasAny(n, ["rapports", "rapport"]) &&
      hasAny(n, ["tous", "tout", "global", "complet", "ensemble"]))
  );
}

function isDaily(n: string): boolean {
  return hasAny(n, [
    "resume du jour",
    "resume jour",
    "bilan du jour",
    "synthese du jour",
    "point du jour",
    "ventes du jour",
    "ventes d aujourd",
    "ventes d hier",
    "ventes hier",
    "regarde les ventes",
    "les ventes",
    "voir les ventes",
  ]) || (/aujourdhui|aujourd hui/.test(n) && hasAny(n, ["resume", "bilan", "synthese", "point", "vente", "ca"]));
}

function isLowStock(n: string): boolean {
  return (
    hasAny(n, ["stocks faibles", "stock faible", "rupture", "ruptures", "sous le seuil"]) ||
    (hasAny(n, ["stock", "stocks"]) && hasAny(n, ["faible", "faibles", "urgent", "recommander", "a commander"]))
  );
}

function isStock(n: string): boolean {
  return hasAny(n, ["stock", "stocks"]) && !isFullReport(n);
}

function isInventory(n: string): boolean {
  return hasAny(n, ["inventaire", "inventaires", "session inventaire"]);
}

function isOrders(n: string): boolean {
  return hasAny(n, [
    "commande",
    "commandes",
    "a preparer",
    "en attente",
    "preparation",
    "paiement en attente",
  ]);
}

function isCatalog(n: string): boolean {
  if (isSimulateDecision(n)) return false;
  return hasAny(n, [
    "catalogue",
    "classification",
    "mal classes",
    "mal classe",
    "sans gamme",
    "fabricant",
    "fabricants",
    "non classes",
    "classer",
  ]) || (hasAny(n, ["gamme", "gammes"]) && !hasAny(n, ["ralent", "promo", "prix", "banniere", "%"]));
}

function isAvaStatus(n: string): boolean {
  return hasAny(n, [
    "ton statut",
    "ton status",
    "statut ava",
    "comment va ava",
    "es-tu en ligne",
    "es tu en ligne",
    "etat ava",
    "erreurs",
    "erreur systeme",
    "diagnostic systeme",
  ]);
}

function isFidelatoo(n: string): boolean {
  return hasAny(n, [
    "fidelatoo",
    "vm android",
    "la vm",
    "vm tourne",
    "statut vm",
    "orchestrateur",
  ]);
}

function isDailyTour(n: string): boolean {
  return hasAny(n, [
    "tour du magasin",
    "fais le tour",
    "fait le tour",
    "faire le tour",
    "tour matin",
    "point magasin",
    "comme une employe",
    "comme une employee",
    "bon matin",
    "quoi de neuf cote boutique",
    "fais le tour",
  ]);
}

function isAnomalies(n: string): boolean {
  return hasAny(n, [
    "anomalie",
    "anomalies",
    "chute inhabituelle",
    "signal inhabituel",
    "detection anomal",
    "ce qui cloche",
    "alerte metier",
  ]);
}

function isReflections(n: string): boolean {
  return hasAny(n, [
    "reflexion",
    "reflexions",
    "pensees metier",
    "hypothese",
    "hypotheses",
    "tes reflexions",
  ]);
}

function isMarketRadar(n: string): boolean {
  return hasAny(n, [
    "radar marche",
    "veille marche",
    "marche web",
    "nouveautes fabricant",
    "tendances marche",
    "ce que font les autres",
    "regarde le marche",
    "concurrents publics",
  ]);
}

function isBusinessIdeas(n: string): boolean {
  return (
    hasAny(n, [
      "idees",
      "une idee",
      "des idees",
      "propose une idee",
      "autre idee",
      "fais moi une autre idee",
      "brainstorm",
      "operations commerciales",
    ]) ||
    (hasAny(n, ["que ferais tu", "si tu dirigeais", "priorites strategiques"]) &&
      !isFullReport(n))
  );
}

function isSimulateDecision(n: string): boolean {
  return (
    /^(et si)\b/.test(n) ||
    hasAny(n, [
      "et si on",
      "et si on faisait",
      "simulation",
      "simule",
      "scenario",
      "banniere",
      "mise en avant 7",
    ]) ||
    /-\s*\d+\s*%/.test(n) ||
    (/\bfaisons\b/.test(n) && /\b\d{1,2}\s*%/.test(n)) ||
    hasAny(n, ["faisons -", "baisser le prix", "on brade", "grosse promo"])
  );
}

function lastUserToolsHint(history: { role: string; content: string }[]): AvaAdminToolName[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i];
    if (t.role !== "user") continue;
    const plan = planFromMessageAlone(t.content);
    if (plan.tools.length && !plan.tools.includes("listCapabilities")) {
      return plan.tools;
    }
  }
  return [];
}

function planFromMessageAlone(message: string): AvaAdminToolPlan {
  const n = norm(message);
  const storeQuery = detectStore(n);
  const limit = detectLimit(n);

  if (!n) {
    return {
      tools: [],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: true,
      clarification: "Qu'est-ce qui te préoccupe — stock, commandes, ou un truc bizarre que tu as vu ?",
      intentLabel: "empty",
    };
  }

  if (isThanks(n)) {
    return {
      tools: [],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: false,
      intentLabel: "thanks",
    };
  }

  // Salutation / smalltalk → AUCUN outil métier (routeur social)
  if (isSocialChitchat(n)) {
    return {
      tools: [],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: false,
      intentLabel: "social_chitchat",
    };
  }

  if (isCapabilities(n)) {
    return {
      tools: ["listCapabilities"],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: false,
      intentLabel: "capabilities",
    };
  }

  if (isFullReport(n)) {
    return {
      tools: ["getFullReport"],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: false,
      intentLabel: "full_report",
    };
  }

  const tools: AvaAdminToolName[] = [];

  if (isDailyTour(n)) tools.push("runDailyTour");
  if (isAnomalies(n)) tools.push("runAnomalyScan");
  if (isReflections(n)) tools.push("getBusinessReflections");
  if (isMarketRadar(n)) tools.push("getMarketRadar");
  if (isBusinessIdeas(n)) tools.push("proposeBusinessIdeas");
  if (isSimulateDecision(n)) tools.push("simulateBusinessDecision");

  if (isDaily(n)) tools.push("getDailySummary");
  if (isLowStock(n)) tools.push("getLowStockReport");
  else if (isStock(n)) tools.push("getStockReport");
  if (isInventory(n)) tools.push("getInventoryReport");
  if (isOrders(n)) tools.push("getOrdersReport");
  if (isCatalog(n)) tools.push("getCatalogAudit");
  if (isFidelatoo(n)) tools.push("getFidelatooStatus");
  else if (isAvaStatus(n)) tools.push("getAvaStatus");

  // « point » / « résumé » sans précision → résumé jour
  if (!tools.length && hasAny(n, ["resume", "point", "bilan", "synthese", "rapport", "rapports"])) {
    tools.push("getDailySummary");
  }

  if (tools.length) {
    return {
      tools: [...new Set(tools)],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: false,
      intentLabel: tools.join("+"),
    };
  }

  return {
    tools: [],
    storeQuery,
    limit,
    periodKey: null,
    needsClarification: true,
    clarification:
      "J'ai pas accroché. Tu veux que je regarde un stock, une commande, ou que je te dise ce qui cloche côté chiffres ?",
    intentLabel: "unclear",
  };
}
/**
 * Suites du type « et seulement Hautmont ? » / « et les 10 plus urgents ? »
 */
export function selectAdminTools(
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): AvaAdminToolPlan {
  const n = norm(message);
  const base = planFromMessageAlone(message);

  // Intent clair du message courant (ex. « et si… ») → ne jamais écraser par un follow-up stock
  if (base.tools.length > 0 && !base.needsClarification) {
    return base;
  }

  const isFollowUp =
    (/^(et|donc|ensuite|uniquement|seulement|juste|aussi|pareil|idem)\b/.test(n) &&
      !/^(et si)\b/.test(n)) ||
    (n.length < 48 &&
      (detectStore(n) ||
        detectLimit(n) ||
        hasAny(n, ["plus detail", "detaille", "plus urgent", "filtre"])));

  if (isFollowUp || (base.needsClarification && (detectStore(n) || detectLimit(n)))) {
    const prev = lastUserToolsHint(history);
    if (prev.length) {
      // Affiner un rapport stock précédent
      const tools = prev.map((t) =>
        t === "getStockReport" || t === "getLowStockReport" || t === "getFullReport"
          ? ("getLowStockReport" as AvaAdminToolName)
          : t
      );
      // Full report follow-up store → stocks filtrés plutôt que tout rejouer
      const refined =
        prev.includes("getFullReport") && detectStore(n)
          ? (["getLowStockReport", "getInventoryReport"] as AvaAdminToolName[])
          : [...new Set(tools)];

      return {
        tools: refined.length ? refined : prev,
        storeQuery: detectStore(n) || base.storeQuery,
        limit: detectLimit(n) || base.limit,
        periodKey: null,
        needsClarification: false,
        intentLabel: `followup:${refined.join("+") || prev.join("+")}`,
      };
    }
  }

  return base;
}
