import type { BiIdea } from "./types";

export type DecisionScenario = {
  label: "PRUDENT" | "CENTRAL" | "OPTIMISTE";
  summary: string;
  assumptions: string[];
  risks: string[];
  missingData: string[];
};

export type DecisionSimulation = {
  question: string;
  concerned: string[];
  constraints: string[];
  sensitive: boolean;
  requiresHumanValidation: boolean;
  scenarios: DecisionScenario[];
  opinion: string;
  confidence: number;
};

/**
 * Simulateur « et si on faisait X ? » — scénarios, pas prédiction exacte.
 */
export function simulateDecision(params: {
  proposal: string;
  contextFacts?: string[];
  stockTight?: boolean;
  visibilityIssueSuspected?: boolean;
  conversionOk?: boolean;
}): DecisionSimulation {
  const p = params.proposal.trim();
  const lower = p.toLowerCase();
  const isDiscount = /-\s*\d+\s*%|promo|remise|soldes|baisser\s+le\s+prix|r[eé]duction/.test(
    lower
  );
  const isBanner = /banni[eè]re|mise\s+en\s+avant|homepage|visibilit/.test(lower);
  const deepCut = /-\s*3[0-9]\s*%|-\s*[4-9]\d\s*%/.test(lower);

  const concerned: string[] = [];
  if (isDiscount) concerned.push("prix", "marge", "stock");
  if (isBanner) concerned.push("visibilité site", "trafic gamme");
  if (!concerned.length) concerned.push("opération proposée");

  const constraints: string[] = [
    "Pas d'action sensible sans validation humaine",
    "Corrélation ≠ causalité",
  ];
  if (params.stockTight) constraints.push("Stock tendu — éviter d'accélérer la demande sans réassort");

  const scenarios: DecisionScenario[] = [
    {
      label: "PRUDENT",
      summary: isBanner
        ? "Mise en avant limitée 5–7 jours, mesure clics/ventes, pas de changement de prix."
        : isDiscount
          ? "Tester d'abord une mise en avant ou une remise légère ciblée, pas une coupe profonde."
          : "Déployer à petite échelle, mesurer, puis décider.",
      assumptions: ["Trafic stable", "Pas de rupture majeure"],
      risks: ["Effet trop faible pour conclure"],
      missingData: ["baseline vues/ventes précise"],
    },
    {
      label: "CENTRAL",
      summary: isDiscount
        ? "Remise modérée possible si stock élevé ET conversion déjà faible après visibilité."
        : "Effet mesurable probable si l'hypothèse de visibilité/stock est juste.",
      assumptions: params.visibilityIssueSuspected
        ? ["Visibilité insuffisante"]
        : ["Hypothèse métier encore ouverte"],
      risks: isDiscount ? ["Pression marge", "Ancrage prix"] : ["Cannibalisation d'autres gammes"],
      missingData: ["élasticité prix réelle", "saisonnalité"],
    },
    {
      label: "OPTIMISTE",
      summary: "Si l'hypothèse est correcte, hausse visible du trafic et des ventes sur la fenêtre de test.",
      assumptions: ["Cause bien identifiée", "Exécution propre"],
      risks: ["Sur-interprétation d'un pic court"],
      missingData: ["groupe de contrôle"],
    },
  ];

  let opinion =
    "Je peux préparer le scénario, mais je ne prétends pas prédire le résultat exact.";
  let confidence = 55;

  if (isDiscount && deepCut && (params.conversionOk || params.visibilityIssueSuspected)) {
    opinion =
      "Je ne commencerais pas par une baisse agressive. Si les clients qui voient la gamme convertissent déjà, je testerais d'abord la visibilité. Si ça ne bouge pas, on revoit le prix avec validation.";
    confidence = 72;
  } else if (isDiscount && params.stockTight) {
    opinion =
      "Une promo forte avec stock tendu risque surtout la rupture. Je privilégierais le réassort ou une animation sans brader.";
    confidence = 70;
  } else if (isBanner) {
    opinion =
      "Une mise en avant courte avec baseline claire est un bon premier test — coût bas, réversible, mesurable.";
    confidence = 68;
  }

  return {
    question: p,
    concerned,
    constraints,
    sensitive: isDiscount || /commande\s+fournisseur|supprim|dns|d[eé]ploiement|paiement/.test(lower),
    requiresHumanValidation:
      isDiscount || /prix|promo|commande|supprim|dns|d[eé]ploiement|paiement/.test(lower),
    scenarios,
    opinion,
    confidence,
  };
}

/** Abandon / révision d'idée quand une donnée contredit. */
export function reconsiderIdea(params: {
  idea: Pick<BiIdea, "title" | "description" | "verdict">;
  newEvidence: string[];
}): { abandon: boolean; statement: string } {
  const evidence = params.newEvidence.join(" ").toLowerCase();
  const wasVisibility = /visibilit|mise en avant|banni/i.test(
    `${params.idea.title} ${params.idea.description}`
  );
  const contradictsVisibility =
    /conversion\s+(bonne|ok|correcte)|clients qui voient|taux de conversion [eé]lev/i.test(
      evidence
    ) && /stock\s+(faible|tendu)|rupture/i.test(evidence);

  if (wasVisibility && contradictsVisibility) {
    return {
      abandon: true,
      statement:
        "Je retire ma première proposition. En regardant le stock et les conversions, ce n'est probablement pas un problème de visibilité.",
    };
  }

  if (/donn[eé]es insuffisantes|donnee manquante|échantillon trop faible/i.test(evidence)) {
    return {
      abandon: true,
      statement:
        "Je suspends cette idée : les données ne suffisent pas pour conclure. Je préfère collecter avant de recommander.",
    };
  }

  return {
    abandon: false,
    statement: "Je maintiens l'idée pour l'instant, avec les réserves déjà notées.",
  };
}

export function formatSimulationForChat(sim: DecisionSimulation): string {
  const lines = [
    `Simulation : ${sim.question}`,
    ``,
    `Avis : ${sim.opinion} (confiance ${sim.confidence}%)`,
    `Concerné : ${sim.concerned.join(", ")}`,
    sim.requiresHumanValidation ? `⚠ Validation humaine requise avant exécution.` : "",
    ``,
    ...sim.scenarios.map(
      (s) =>
        `[${s.label}] ${s.summary}\n  Risques : ${s.risks.join("; ")}\n  Manque : ${s.missingData.join("; ")}`
    ),
  ];
  return lines.filter(Boolean).join("\n");
}
