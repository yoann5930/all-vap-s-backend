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
  return /^(bonjour|bonsoir|salut|hey|hello|coucou)( ava)?[!?.]*$/.test(n);
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
      "quoi de neuf",
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
    "aujourdhui",
    "aujourd hui",
    "bilan du jour",
    "synthese du jour",
  ]);
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
  return hasAny(n, [
    "catalogue",
    "classification",
    "mal classes",
    "mal classe",
    "sans gamme",
    "fabricant",
    "fabricants",
    "gamme",
    "gammes",
    "non classes",
    "classer",
  ]);
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
      clarification: "Dis-moi ce que tu veux regarder : stocks, commandes, inventaire, catalogue ou rapport global ?",
      intentLabel: "empty",
    };
  }

  if (isGreeting(n) || isThanks(n)) {
    return {
      tools: [],
      storeQuery,
      limit,
      periodKey: null,
      needsClarification: false,
      intentLabel: isGreeting(n) ? "greeting" : "thanks",
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
      "Je n'ai pas bien cerné la demande. Tu veux les stocks, les commandes, l'inventaire, le catalogue, mon statut, ou un rapport global ?",
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

  const isFollowUp =
    /^(et|donc|ensuite|uniquement|seulement|juste|aussi|pareil|idem)\b/.test(n) ||
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
