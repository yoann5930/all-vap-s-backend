import { randomBytes } from "crypto";
import type {
  BiAnalysisBundle,
  BiDailyTour,
  BiIdea,
  BiReflectionCard,
  BiTourStop,
} from "./types";
import { collectObservations } from "./observe";
import { detectAnomalies } from "./anomalies";
import {
  applyCritiques,
  critiqueIdeas,
  generateIdeas,
  proposeHypotheses,
} from "./reasoning";
import { gatherMarketRadar } from "./market";
import { saveMarketSignals, saveReflections, upsertBusinessMemory } from "./store";
import type { DatePeriod } from "@/lib/timezone/shop-tz";

function id(p: string) {
  return `${p}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

function buildReflections(
  anomalies: BiAnalysisBundle["anomalies"],
  hypotheses: BiAnalysisBundle["hypotheses"],
  ideas: BiIdea[]
): BiReflectionCard[] {
  const cards: BiReflectionCard[] = [];
  for (const a of anomalies.slice(0, 8)) {
    const hyp = hypotheses.find((h) => h.anomalyId === a.id);
    const idea = ideas.find((i) => i.subject === a.title && i.verdict !== "A_EVITER");
    cards.push({
      id: id("ref"),
      observation: a.text,
      hypothesis: hyp?.statement || "Hypothèse à préciser avec plus de données.",
      idea: idea ? `${idea.title} — ${idea.description}` : "Pas encore d'idée recommandée.",
      confidence: idea?.confidence ?? hyp?.confidence ?? 40,
      proposedAction: idea?.title || "Collecter données manquantes",
      verdict: idea?.verdict || "EXPERIMENTAL",
      updatedAt: new Date().toISOString(),
    });
  }
  return cards;
}

function buildTour(
  anomalies: BiAnalysisBundle["anomalies"],
  ideas: BiIdea[],
  missingData: string[]
): BiDailyTour {
  const urgent = anomalies.filter((a) => a.severity === "high");
  const stops: BiTourStop[] = [];

  if (urgent.length) {
    stops.push({
      id: id("stop"),
      title: "Urgent",
      urgency: "urgent",
      text: urgent
        .slice(0, 3)
        .map((a) => a.text)
        .join(" "),
      observationIds: urgent.map((a) => a.id),
      ideaIds: [],
    });
  }

  for (const a of anomalies.filter((x) => x.severity !== "high").slice(0, 3)) {
    stops.push({
      id: id("stop"),
      title: a.title,
      urgency: "watch",
      text: a.text,
      observationIds: [a.id],
      ideaIds: ideas.filter((i) => i.subject === a.title).slice(0, 2).map((i) => i.id),
    });
  }

  const recommended = ideas.filter((i) => i.verdict === "RECOMMANDE").slice(0, 3);
  if (recommended.length) {
    stops.push({
      id: id("stop"),
      title: "Idées à discuter",
      urgency: "info",
      text: recommended.map((i) => i.title).join(" · "),
      observationIds: [],
      ideaIds: recommended.map((i) => i.id),
    });
  }

  if (!stops.length) {
    stops.push({
      id: id("stop"),
      title: "Rien d'urgent",
      urgency: "info",
      text: "Rien d'urgent ce matin sur les données disponibles. Je peux quand même creuser une gamme ou une boutique si tu veux.",
      observationIds: [],
      ideaIds: [],
    });
  }

  const greeting = urgent.length
    ? `Avant autre chose : ${urgent[0].text}`
    : `J'ai fait le tour. Rien de critique, mais j'ai ${Math.min(
        3,
        stops.length
      )} point(s) intéressants à te montrer.`;

  return {
    generatedAt: new Date().toISOString(),
    greeting,
    stops: stops.slice(0, 6),
    anomalies,
    topIdeas: recommended,
    missingData,
  };
}

/**
 * Pipeline multi-spécialistes interne → une seule A.V.A.
 */
export async function runBusinessIntelligence(params: {
  ownerUserId?: string | null;
  periodKey?: DatePeriod;
  includeMarket?: boolean;
  persist?: boolean;
}): Promise<BiAnalysisBundle> {
  const observed = await collectObservations({ periodKey: params.periodKey });
  const anomalies = detectAnomalies(observed.observations);
  const hypotheses = proposeHypotheses(anomalies, observed.observations);
  let ideas = generateIdeas(anomalies, hypotheses);
  const critiques = critiqueIdeas(ideas);
  ideas = applyCritiques(ideas, critiques);
  const reflections = buildReflections(anomalies, hypotheses, ideas);
  const tour = buildTour(anomalies, ideas, observed.missingData);

  let marketSignals: BiAnalysisBundle["marketSignals"] = [];
  const missing = [...observed.missingData];

  if (params.includeMarket) {
    const market = await gatherMarketRadar();
    marketSignals = market.signals;
    missing.push(...market.missingData);
  }

  if (params.persist && params.ownerUserId) {
    await saveReflections(params.ownerUserId, reflections);
    if (marketSignals?.length) {
      await saveMarketSignals(params.ownerUserId, marketSignals);
    }
    // Préférence métier implicite déjà connue du chantier
    if (ideas.some((i) => i.title.includes("Mise en avant"))) {
      await upsertBusinessMemory(params.ownerUserId, {
        kind: "PREFERENCE",
        subject: "marketing_strategy",
        content:
          "Préférer tester une mise en avant avant une réduction de prix agressive.",
        confidence: 80,
        source: "ava_bi_policy",
      }).catch(() => null);
    }
  }

  return {
    observations: observed.observations,
    anomalies,
    hypotheses,
    ideas,
    critiques,
    reflections,
    tour,
    marketSignals,
    missingData: [...new Set(missing)],
    generatedAt: new Date().toISOString(),
  };
}

export function formatTourForChat(tour: BiDailyTour, opts?: { short?: boolean }): string {
  const short = opts?.short ?? false;
  const stops = tour.stops.slice(0, short ? 2 : 4);
  const parts: string[] = [tour.greeting];
  const greetingCore = tour.greeting
    .replace(/^avant autre chose\s*:\s*/i, "")
    .replace(/^j'ai fait le tour[^.]*\.\s*/i, "")
    .trim()
    .toLowerCase();

  for (const s of stops) {
    const stopCore = s.text.trim().toLowerCase();
    if (
      stopCore &&
      (greetingCore.includes(stopCore.slice(0, Math.min(48, stopCore.length))) ||
        stopCore.includes(greetingCore.slice(0, Math.min(48, greetingCore.length))))
    ) {
      continue;
    }
    const titleIsGeneric = /^(urgent|à surveiller|a surveiller|idées? à discuter|rien d'urgent)$/i.test(
      s.title.trim()
    );
    if (s.urgency === "urgent") {
      parts.push(titleIsGeneric ? `Urgent : ${s.text}` : `Urgent — ${s.title} : ${s.text}`);
    } else if (s.urgency === "watch") {
      parts.push(
        titleIsGeneric ? `À surveiller : ${s.text}` : `À surveiller — ${s.title} : ${s.text}`
      );
    } else if (!/rien d'urgent|rien de critique/i.test(s.title + s.text)) {
      parts.push(titleIsGeneric ? s.text : `${s.title} : ${s.text}`);
    }
  }

  const idea = tour.topIdeas[0];
  if (idea) {
    parts.push(
      short
        ? `Piste que je garderais : ${idea.title}.`
        : `Piste que je garderais : ${idea.title} (${idea.verdict}, confiance ${idea.confidence}%). ${idea.description}`
    );
  }

  if (!short && tour.missingData.length) {
    parts.push(`Il me manque encore : ${tour.missingData.slice(0, 3).join(", ")}.`);
  }

  if (short) {
    parts.push("Tu veux que je creuse le point le plus chaud, ou on passe à autre chose ?");
  }

  return parts.filter(Boolean).join("\n\n");
}

export function formatReflectionsForChat(cards: BiReflectionCard[]): string {
  if (!cards.length) return "Pas encore de réflexion métier structurée pour l'instant.";
  return cards
    .slice(0, 5)
    .map(
      (c, i) =>
        `${i + 1}. OBSERVATION : ${c.observation}\n` +
        `   HYPOTHÈSE : ${c.hypothesis}\n` +
        `   IDÉE : ${c.idea}\n` +
        `   CONFIANCE : ${c.confidence}% · ${c.verdict}\n` +
        `   ACTION : ${c.proposedAction}`
    )
    .join("\n\n");
}

export function formatIdeasForChat(ideas: BiIdea[]): string {
  const usable = ideas.filter((i) => i.verdict !== "A_EVITER");
  const avoided = ideas.filter((i) => i.verdict === "A_EVITER");
  const lines: string[] = [];
  for (const idea of usable.slice(0, 6)) {
    lines.push(
      `· ${idea.title} [${idea.verdict}] (confiance ${idea.confidence}%)` +
        `\n  ${idea.description}` +
        `\n  Attendu : ${idea.expectedResult}` +
        (idea.requiresHumanValidation ? `\n  ⚠ Validation humaine requise` : "")
    );
  }
  if (avoided.length) {
    lines.push("");
    lines.push("À éviter en première intention :");
    for (const idea of avoided.slice(0, 3)) {
      lines.push(`· ${idea.title} — ${idea.risks.join("; ")}`);
    }
  }
  return lines.join("\n") || "Aucune idée solide avec les données actuelles.";
}
