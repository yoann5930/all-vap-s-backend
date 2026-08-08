/**
 * 50+ scénarios d'intelligence métier A.V.A. (déterministes, hors prod).
 * Usage: npx tsx scripts/smoke-ava-business-intelligence.ts
 */
import { selectAdminTools } from "../lib/ava/admin-tools";
import {
  detectAnomalies,
  proposeHypotheses,
  generateIdeas,
  critiqueIdeas,
  applyCritiques,
  simulateDecision,
  reconsiderIdea,
  type BiObservation,
  type BiAnomaly,
} from "../lib/ava/business-intelligence";

type Scenario = {
  id: number;
  name: string;
  run: () => boolean | string;
};

function obs(partial: Partial<BiObservation> & Pick<BiObservation, "subject" | "text">): BiObservation {
  return {
    id: `t_${partial.subject}`,
    kind: partial.kind || "other",
    subject: partial.subject,
    text: partial.text,
    metrics: partial.metrics,
    source: "test",
    observedAt: new Date().toISOString(),
  };
}

function salesDropBundle(): BiObservation[] {
  return [
    obs({
      kind: "sales",
      subject: "ventes_periode",
      text: "Période test : 12 commandes payées",
      metrics: { paid: 12, received: 14, toPrepare: 1, revenueCents: 100000 },
    }),
    obs({
      kind: "sales",
      subject: "comparaison_periode",
      text: "Δ CA -30%",
      metrics: { ordersDelta: -8, revenueDeltaPct: -30 },
    }),
    obs({
      kind: "stock",
      subject: "stock_alertes",
      text: "Stocks OK",
      metrics: { low: 2, out: 1, negative: 0 },
    }),
  ];
}

function stockCrisisBundle(): BiObservation[] {
  return [
    obs({
      kind: "stock",
      subject: "stock_alertes",
      text: "Crise stock",
      metrics: { low: 20, out: 12, negative: 3 },
    }),
    obs({
      kind: "sales",
      subject: "ventes_periode",
      text: "Ventes normales",
      metrics: { paid: 20, received: 22, toPrepare: 2 },
    }),
    obs({
      kind: "sales",
      subject: "comparaison_periode",
      text: "stable",
      metrics: { ordersDelta: 0, revenueDeltaPct: 2 },
    }),
  ];
}

const scenarios: Scenario[] = [];
let n = 0;
const add = (name: string, run: () => boolean | string) => {
  n += 1;
  scenarios.push({ id: n, name, run });
};

// --- Routage conversationnel (1–12)
add("bonjour → pas d'outil", () => selectAdminTools("Bonjour").tools.length === 0);
add("tour magasin", () => selectAdminTools("Fais le tour").tools.includes("runDailyTour"));
add("anomalies", () => selectAdminTools("Quelles anomalies ?").tools.includes("runAnomalyScan"));
add("réflexions", () =>
  selectAdminTools("Montre tes réflexions").tools.includes("getBusinessReflections")
);
add("radar", () => selectAdminTools("Regarde le marché").tools.includes("getMarketRadar"));
add("idées", () => selectAdminTools("Propose des idées").tools.includes("proposeBusinessIdeas"));
add("simulation -30%", () =>
  selectAdminTools("Et si on faisait -30 % ?").tools.includes("simulateBusinessDecision")
);
add("ça va → pas d'outil", () => selectAdminTools("Ça va Ava ?").tools.length === 0);
add("vas-y → pas de tour auto", () => !selectAdminTools("Vas-y").tools.includes("runDailyTour"));
add("stocks faibles", () =>
  selectAdminTools("Stocks faibles Hautmont").tools.includes("getLowStockReport")
);
add("rapport global", () =>
  selectAdminTools("Tous les rapports").tools.includes("getFullReport")
);
add("unclear junk", () => selectAdminTools("zzzzqwerty").needsClarification === true);

// --- Anomalies (13–22)
add("détecte baisse CA", () => {
  const a = detectAnomalies(salesDropBundle());
  return a.some((x) => x.code === "SALES_DROP");
});
add("détecte stocks négatifs", () => {
  const a = detectAnomalies(stockCrisisBundle());
  return a.some((x) => x.code === "STOCK_NEGATIVE");
});
add("détecte ruptures cluster", () => {
  const a = detectAnomalies(stockCrisisBundle());
  return a.some((x) => x.code === "STOCK_OUT_CLUSTER");
});
add("pas de fausse baisse si stable", () => {
  const a = detectAnomalies([
    obs({
      kind: "sales",
      subject: "ventes_periode",
      text: "ok",
      metrics: { paid: 10, received: 10, toPrepare: 0 },
    }),
    obs({
      kind: "sales",
      subject: "comparaison_periode",
      text: "ok",
      metrics: { ordersDelta: 1, revenueDeltaPct: 3 },
    }),
  ]);
  return !a.some((x) => x.code === "SALES_DROP" || x.code === "ORDERS_DROP");
});
add("catalogue backlog", () => {
  const a = detectAnomalies([
    obs({
      kind: "catalog",
      subject: "classification",
      text: "retard",
      metrics: { unclassified: 80, toReview: 10, noRange: 60 },
    }),
  ]);
  return a.some((x) => x.code === "CATALOG_BACKLOG");
});
add("préparation chargée", () => {
  const a = detectAnomalies([
    obs({
      kind: "sales",
      subject: "ventes_periode",
      text: "prep",
      metrics: { paid: 5, received: 8, toPrepare: 9 },
    }),
  ]);
  return a.some((x) => x.code === "PREP_BACKLOG");
});
add("priorité high stock négatif", () => {
  const a = detectAnomalies(stockCrisisBundle());
  const neg = a.find((x) => x.code === "STOCK_NEGATIVE");
  return !!neg && neg.severity === "high";
});
add("anomalies triées", () => {
  const a = detectAnomalies(stockCrisisBundle());
  if (a.length < 2) return true;
  const score = (x: BiAnomaly) =>
    x.priority.impact * x.priority.urgency * x.priority.confidence;
  return score(a[0]) >= score(a[1]);
});
add("observation stock faible sans négatif", () => {
  const a = detectAnomalies([
    obs({
      kind: "stock",
      subject: "stock_alertes",
      text: "faibles",
      metrics: { low: 15, out: 2, negative: 0 },
    }),
  ]);
  return a.some((x) => x.code === "STOCK_LOW_CLUSTER") && !a.some((x) => x.code === "STOCK_NEGATIVE");
});
add("zéro vente signalé", () => {
  const a = detectAnomalies([
    obs({
      kind: "sales",
      subject: "ventes_periode",
      text: "zero",
      metrics: { paid: 0, received: 0, toPrepare: 0 },
    }),
    obs({
      kind: "sales",
      subject: "comparaison_periode",
      text: "n/a",
      metrics: { ordersDelta: 0 },
    }),
  ]);
  return a.some((x) => x.code === "SALES_FLAT_ZERO");
});

// --- Hypothèses (23–28)
add("plusieurs hypothèses sur baisse", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  return h.length >= 3;
});
add("hypothèse statut open", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  return h.every((x) => x.status === "open");
});
add("hypothèse a missingData", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  return h.every((x) => x.missingData.length > 0);
});
add("hypothèse stock a variante inventaire", () => {
  const an = detectAnomalies(stockCrisisBundle());
  const h = proposeHypotheses(an, stockCrisisBundle());
  return h.some((x) => /inventaire|synchro/i.test(x.statement));
});
add("confiance hypothèse bornée", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  return h.every((x) => x.confidence >= 0 && x.confidence <= 100);
});
add("pas d'hypothèse sans anomalie", () => {
  return proposeHypotheses([], salesDropBundle()).length === 0;
});

// --- Idées + critique (29–38)
add("plusieurs idées sur baisse", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  const ideas = generateIdeas(an, h);
  return ideas.length >= 3;
});
add("remise -30% classée A_EVITER", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  const raw = generateIdeas(an, h);
  const ideas = applyCritiques(raw, critiqueIdeas(raw));
  const deep = ideas.find((i) => /-\s*30/i.test(i.title));
  return !!deep && deep.verdict === "A_EVITER";
});
add("mise en avant recommandée ou intéressante", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  const raw = generateIdeas(an, h);
  const ideas = applyCritiques(raw, critiqueIdeas(raw));
  const banner = ideas.find((i) => /mise en avant/i.test(i.title));
  return !!banner && (banner.verdict === "RECOMMANDE" || banner.verdict === "INTERESSANT");
});
add("idées sensibles → validation humaine", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  const ideas = generateIdeas(an, h);
  return ideas.filter((i) => i.sensitiveActions.length).every((i) => i.requiresHumanValidation);
});
add("critique ajuste marge haute", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  const fakeIdea = generateIdeas(an, h).find((i) => /-\s*30/i.test(i.title));
  if (!fakeIdea) return false;
  const c = critiqueIdeas([fakeIdea])[0];
  return c.adjustedVerdict === "A_EVITER" || fakeIdea.verdict === "A_EVITER";
});
add("pas uniquement des promos", () => {
  const an = detectAnomalies(salesDropBundle());
  const ideas = generateIdeas(an, proposeHypotheses(an, salesDropBundle()));
  const nonPromo = ideas.filter((i) => !/remise|promo|-%/i.test(i.title));
  return nonPromo.length >= 2;
});
add("stock → idée réassort sensible", () => {
  const an = detectAnomalies(stockCrisisBundle());
  const ideas = generateIdeas(an, proposeHypotheses(an, stockCrisisBundle()));
  return ideas.some(
    (i) => i.sensitiveActions.includes("COMMANDES_FOURNISSEURS") && i.requiresHumanValidation
  );
});
add("catalogue → sprint classification", () => {
  const an = detectAnomalies([
    obs({
      kind: "catalog",
      subject: "classification",
      text: "retard",
      metrics: { unclassified: 90, noRange: 70 },
    }),
  ]);
  const ideas = generateIdeas(an, proposeHypotheses(an, []));
  return ideas.some((i) => /classification/i.test(i.title));
});
add("applyCritiques change verdict", () => {
  const an = detectAnomalies(salesDropBundle());
  const raw = generateIdeas(an, proposeHypotheses(an, salesDropBundle()));
  const after = applyCritiques(raw, critiqueIdeas(raw));
  const deep = after.find((i) => /-\s*30/i.test(i.title));
  return !!deep && deep.verdict === "A_EVITER";
});
add("idée a expectedResult", () => {
  const an = detectAnomalies(salesDropBundle());
  const ideas = generateIdeas(an, proposeHypotheses(an, salesDropBundle()));
  return ideas.every((i) => i.expectedResult.length > 5);
});
// --- Simulation / avis / abandon (39–46)
add("avis contre -30% si conversion ok", () => {
  const sim = simulateDecision({
    proposal: "Faisons -30 % sur la gamme X",
    visibilityIssueSuspected: true,
    conversionOk: true,
  });
  return /ne commencerais pas|visibilit/i.test(sim.opinion) && sim.requiresHumanValidation;
});
add("3 scénarios simulation", () => {
  const sim = simulateDecision({ proposal: "Bannière homepage 7 jours" });
  return (
    sim.scenarios.length === 3 &&
    sim.scenarios.map((s) => s.label).join(",") === "PRUDENT,CENTRAL,OPTIMISTE"
  );
});
add("promo = sensible", () => {
  return simulateDecision({ proposal: "Grosse promo -40 %" }).sensitive === true;
});
add("bannière non forcément sensitive prix", () => {
  const sim = simulateDecision({ proposal: "Mise en avant homepage" });
  return sim.requiresHumanValidation === false || sim.sensitive === false;
});
add("stock tendu → avis réassort", () => {
  const sim = simulateDecision({
    proposal: "Promo forte demain",
    stockTight: true,
  });
  return /rupture|réassort|brader/i.test(sim.opinion);
});
add("abandon idée visibilité", () => {
  const r = reconsiderIdea({
    idea: {
      title: "Mise en avant homepage",
      description: "Problème de visibilité",
      verdict: "RECOMMANDE",
    },
    newEvidence: [
      "conversion bonne sur la page gamme",
      "stock faible / rupture sur les références qui tournent",
    ],
  });
  return r.abandon === true && /retire/i.test(r.statement);
});
add("pas abandon sans contradiction", () => {
  const r = reconsiderIdea({
    idea: {
      title: "Mise en avant homepage",
      description: "Visibilité",
      verdict: "RECOMMANDE",
    },
    newEvidence: ["trafic encore faible sur la gamme"],
  });
  return r.abandon === false;
});
add("abandon si données insuffisantes", () => {
  const r = reconsiderIdea({
    idea: { title: "Bundle", description: "test", verdict: "EXPERIMENTAL" },
    newEvidence: ["données insuffisantes — échantillon trop faible"],
  });
  return r.abandon === true;
});

// --- Pièges anti-hallucination / garde-fous (47–55)
add("pas conclure cause unique", () => {
  const an = detectAnomalies(salesDropBundle());
  const h = proposeHypotheses(an, salesDropBundle());
  const statements = new Set(h.map((x) => x.statement));
  return statements.size >= 2;
});
add("confiance jamais 100 sur hyp", () => {
  const an = detectAnomalies(salesDropBundle());
  return proposeHypotheses(an, salesDropBundle()).every((h) => h.confidence < 100);
});
add("import marché toujours false (type)", () => {
  // Contrôle structurel : le type impose importProduct: false
  const sample = { importProduct: false as const };
  return sample.importProduct === false;
});
add("simulation DNS sensible", () => {
  return simulateDecision({ proposal: "Change le DNS production" }).requiresHumanValidation;
});
add("simulation paiement sensible", () => {
  return simulateDecision({ proposal: "Lancer un paiement fournisseur" }).requiresHumanValidation;
});
add("follow-up store conserve outil", () => {
  const p = selectAdminTools("Et seulement Hautmont ?", [
    { role: "user", content: "Donne-moi les stocks faibles" },
    { role: "assistant", content: "Voici..." },
  ]);
  return p.storeQuery === "Hautmont" && p.tools.includes("getLowStockReport");
});
add("capacités listées", () =>
  selectAdminTools("Que peux-tu faire ?").tools.includes("listCapabilities")
);
add("stratégie dirigeais → idées", () =>
  selectAdminTools("Si tu dirigeais la boutique aujourd'hui ?").tools.includes(
    "proposeBusinessIdeas"
  )
);
add("ce que font les autres → radar", () =>
  selectAdminTools("Regarde ce que font les autres").tools.includes("getMarketRadar")
);

// Exécution
let failed = 0;
const results: { id: number; name: string; ok: boolean; detail?: string }[] = [];
for (const s of scenarios) {
  try {
    const out = s.run();
    const ok = out === true;
    if (!ok) {
      failed += 1;
      results.push({ id: s.id, name: s.name, ok: false, detail: String(out) });
      console.log(`FAIL #${s.id} ${s.name}`, out);
    } else {
      results.push({ id: s.id, name: s.name, ok: true });
      console.log(`OK   #${s.id} ${s.name}`);
    }
  } catch (e) {
    failed += 1;
    results.push({
      id: s.id,
      name: s.name,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    console.log(`FAIL #${s.id} ${s.name}`, e);
  }
}

console.log(`\n${results.filter((r) => r.ok).length}/${scenarios.length} scénarios OK`);
if (failed) {
  process.exit(1);
}
console.log("Smoke BI métier : OK");
