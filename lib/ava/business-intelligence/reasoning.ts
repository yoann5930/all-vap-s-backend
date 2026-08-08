import { randomBytes } from "crypto";
import type {
  BiAnomaly,
  BiCritique,
  BiHypothesis,
  BiIdea,
  BiIdeaVerdict,
  BiObservation,
} from "./types";

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

/**
 * Plusieurs hypothèses par anomalie — jamais une conclusion unique automatique.
 */
export function proposeHypotheses(
  anomalies: BiAnomaly[],
  observations: BiObservation[]
): BiHypothesis[] {
  const hyps: BiHypothesis[] = [];
  const obsText = observations.map((o) => o.text).join(" ");

  for (const a of anomalies.slice(0, 6)) {
    if (a.code.startsWith("SALES_") || a.code === "ORDERS_DROP") {
      hyps.push(
        {
          id: id("hyp"),
          anomalyId: a.id,
          subject: a.title,
          statement: "Baisse de demande réelle sur la période.",
          favoring: ["Volume/CA en baisse vs période précédente"],
          contradicting: /stock élevé|conversion/i.test(obsText)
            ? ["Certaines gammes peuvent rester convertissantes"]
            : [],
          missingData: ["trafic site", "saisonnalité fine", "campagnes en cours"],
          confidence: 45,
          status: "open",
        },
        {
          id: id("hyp"),
          anomalyId: a.id,
          subject: a.title,
          statement: "Problème de visibilité catalogue / mise en avant.",
          favoring: ["Possible si classification/catalogue en retard"],
          contradicting: [],
          missingData: ["vues pages gammes", "taux de clic fabricant"],
          confidence: 55,
          status: "open",
        },
        {
          id: id("hyp"),
          anomalyId: a.id,
          subject: a.title,
          statement: "Contrainte stock (ruptures) qui freine les ventes.",
          favoring: observations.some((o) => o.subject.includes("stock"))
            ? ["Alertes stock présentes dans l'observation"]
            : [],
          contradicting: [],
          missingData: ["lien produit-par-produit ventes vs ruptures"],
          confidence: 50,
          status: "open",
        }
      );
    } else if (a.code.startsWith("STOCK_")) {
      hyps.push(
        {
          id: id("hyp"),
          anomalyId: a.id,
          subject: a.title,
          statement: "Rotation plus rapide que le réassort.",
          favoring: ["Faibles / ruptures détectés"],
          contradicting: [],
          missingData: ["délais fournisseur", "prévisions 7j"],
          confidence: 60,
          status: "open",
        },
        {
          id: id("hyp"),
          anomalyId: a.id,
          subject: a.title,
          statement: "Écart inventaire / synchro stock (erreur de données).",
          favoring: a.code === "STOCK_NEGATIVE" ? ["Stock négatif = signal fort d'écart"] : [],
          contradicting: [],
          missingData: ["dernière session inventaire boutique"],
          confidence: a.code === "STOCK_NEGATIVE" ? 70 : 40,
          status: "open",
        }
      );
    } else if (a.code === "CATALOG_BACKLOG") {
      hyps.push({
        id: id("hyp"),
        anomalyId: a.id,
        subject: a.title,
        statement: "Le retard de classification réduit la découvrabilité.",
        favoring: ["Volume élevé de non classés / sans gamme"],
        contradicting: [],
        missingData: ["impact réel trafic sur pages fabricant/gamme"],
        confidence: 65,
        status: "open",
      });
    } else if (a.code === "PREP_BACKLOG") {
      hyps.push({
        id: id("hyp"),
        anomalyId: a.id,
        subject: a.title,
        statement: "Pic de commandes ou capacité préparation insuffisante momentanément.",
        favoring: ["File à préparer élevée"],
        contradicting: [],
        missingData: ["temps moyen de préparation", "effectif du jour"],
        confidence: 58,
        status: "open",
      });
    }
  }

  return hyps;
}

function verdictFromScore(score: number, sensitive: boolean): BiIdeaVerdict {
  if (sensitive && score < 70) return "A_EVITER";
  if (score >= 75) return "RECOMMANDE";
  if (score >= 55) return "INTERESSANT";
  if (score >= 40) return "EXPERIMENTAL";
  return "A_EVITER";
}

/**
 * Génère plusieurs options (pas seulement une promo).
 */
export function generateIdeas(
  anomalies: BiAnomaly[],
  hypotheses: BiHypothesis[]
): BiIdea[] {
  const ideas: BiIdea[] = [];
  const top = anomalies.slice(0, 4);

  for (const a of top) {
    const related = hypotheses.filter((h) => h.anomalyId === a.id);
    const hypIds = related.map((h) => h.id);

    if (a.code.startsWith("SALES_") || a.code === "ORDERS_DROP") {
      ideas.push(
        makeIdea({
          subject: a.title,
          title: "Mise en avant homepage 7 jours",
          description:
            "Tester une bannière / bloc homepage sur la gamme ou famille concernée avant toute baisse de prix.",
          hypothesisIds: hypIds,
          expectedResult: "Hausse trafic page gamme et ventes associées.",
          risks: ["Cannibalisation d'autres mises en avant"],
          benefits: ["Mesurable", "Réversible", "Préserve la marge"],
          cost: "low",
          complexity: "low",
          marginImpact: "none",
          stockImpact: "none",
          brandFit: "high",
          score: 78,
          sensitive: false,
        }),
        makeIdea({
          subject: a.title,
          title: "Améliorer fiches & images de la gamme",
          description:
            "Corriger classification, images manquantes et textes avant d'envisager une promo.",
          hypothesisIds: hypIds,
          expectedResult: "Meilleure conversion des visiteurs déjà présents.",
          risks: ["Effort catalogue"],
          benefits: ["Effet durable", "Aide aussi A.V.A. vendeuse"],
          cost: "medium",
          complexity: "medium",
          marginImpact: "none",
          stockImpact: "none",
          brandFit: "high",
          score: 72,
          sensitive: false,
        }),
        makeIdea({
          subject: a.title,
          title: "Bundle pertinent sans dumping",
          description:
            "Proposer un pack cohérent (appareil + liquides / résistances) plutôt qu'une remise plate -30 %.",
          hypothesisIds: hypIds,
          expectedResult: "Hausse panier moyen sans dégrader l'image prix.",
          risks: ["Stock du produit d'accompagnement"],
          benefits: ["Valeur perçue", "Moins agressif qu'une grosse promo"],
          cost: "medium",
          complexity: "medium",
          marginImpact: "low",
          stockImpact: "uses_overstock",
          brandFit: "high",
          score: 68,
          sensitive: true,
          sensitiveActions: ["PROMOTIONS"],
        }),
        makeIdea({
          subject: a.title,
          title: "Remise -30 % immédiate",
          description:
            "Baisser fortement le prix sans tester d'abord la visibilité — à éviter en première intention.",
          hypothesisIds: hypIds,
          expectedResult: "Boost court terme possible, risque marge et ancrage prix.",
          risks: ["Impact marge", "Ancrage prix bas", "Peut masquer un problème de visibilité"],
          benefits: ["Effet rapide éventuel"],
          cost: "high",
          complexity: "low",
          marginImpact: "high",
          stockImpact: "helps",
          brandFit: "low",
          score: 28,
          sensitive: true,
          sensitiveActions: ["PRIX", "PROMOTIONS"],
        })
      );
    }

    if (a.code.startsWith("STOCK_")) {
      ideas.push(
        makeIdea({
          subject: a.title,
          title: "Prioriser réassort des références qui tournent",
          description:
            "Lister les ruptures/faibles à plus forte rotation et préparer une commande fournisseur (validation humaine).",
          hypothesisIds: hypIds,
          expectedResult: "Réduction ruptures sur best-sellers.",
          risks: ["Surstock si mauvaise prévision"],
          benefits: ["Protège le CA"],
          cost: "medium",
          complexity: "medium",
          marginImpact: "none",
          stockImpact: "helps",
          brandFit: "high",
          score: 80,
          sensitive: true,
          sensitiveActions: ["COMMANDES_FOURNISSEURS"],
        }),
        makeIdea({
          subject: a.title,
          title: "Contrôle inventaire ciblé",
          description:
            "Lancer un inventaire partiel sur les stocks négatifs / écarts avant de commander.",
          hypothesisIds: hypIds,
          expectedResult: "Fiabiliser les données avant action achat.",
          risks: ["Temps magasin"],
          benefits: ["Évite commandes inutiles"],
          cost: "low",
          complexity: "low",
          marginImpact: "none",
          stockImpact: "none",
          brandFit: "high",
          score: 76,
          sensitive: false,
        })
      );
    }

    if (a.code === "CATALOG_BACKLOG") {
      ideas.push(
        makeIdea({
          subject: a.title,
          title: "Sprint classification fabricant→gamme",
          description:
            "Traiter d'abord les fabricants à fort volume de produits non classés.",
          hypothesisIds: hypIds,
          expectedResult: "Pages gammes plus peuplées, meilleure navigation.",
          risks: ["Charge admin"],
          benefits: ["SEO interne", "A.V.A. vendeuse plus précise"],
          cost: "medium",
          complexity: "medium",
          marginImpact: "none",
          stockImpact: "none",
          brandFit: "high",
          score: 74,
          sensitive: false,
        })
      );
    }

    if (a.code === "PREP_BACKLOG") {
      ideas.push(
        makeIdea({
          subject: a.title,
          title: "Session préparation priorisée",
          description:
            "Traiter d'abord les commandes les plus anciennes / express avant le reste.",
          hypothesisIds: hypIds,
          expectedResult: "Réduction file et délais clients.",
          risks: ["Faible"],
          benefits: ["Opérationnel immédiat"],
          cost: "low",
          complexity: "low",
          marginImpact: "none",
          stockImpact: "none",
          brandFit: "high",
          score: 82,
          sensitive: false,
        })
      );
    }
  }

  return ideas;
}

function makeIdea(input: {
  subject: string;
  title: string;
  description: string;
  hypothesisIds: string[];
  expectedResult: string;
  risks: string[];
  benefits: string[];
  cost: BiIdea["cost"];
  complexity: BiIdea["complexity"];
  marginImpact: BiIdea["marginImpact"];
  stockImpact: BiIdea["stockImpact"];
  brandFit: BiIdea["brandFit"];
  score: number;
  sensitive: boolean;
  sensitiveActions?: string[];
}): BiIdea {
  return {
    id: id("idea"),
    subject: input.subject,
    title: input.title,
    description: input.description,
    hypothesisIds: input.hypothesisIds,
    expectedResult: input.expectedResult,
    risks: input.risks,
    benefits: input.benefits,
    cost: input.cost,
    complexity: input.complexity,
    marginImpact: input.marginImpact,
    stockImpact: input.stockImpact,
    brandFit: input.brandFit,
    verdict: verdictFromScore(input.score, input.sensitive),
    confidence: Math.min(95, Math.max(20, input.score)),
    requiresHumanValidation: input.sensitive || input.sensitiveActions?.length
      ? true
      : false,
    sensitiveActions: input.sensitiveActions || [],
  };
}

/** Second contrôle interne (agent critique). */
export function critiqueIdeas(ideas: BiIdea[]): BiCritique[] {
  return ideas.map((idea) => {
    const ignoredRisks: string[] = [];
    const betterAlternatives: string[] = [];
    let adjusted = idea.verdict;

    if (idea.marginImpact === "high" && idea.verdict !== "A_EVITER") {
      ignoredRisks.push("Impact marge élevé — privilégier test non tarifaire");
      adjusted = "A_EVITER";
      betterAlternatives.push("Mise en avant / fiches avant promo profonde");
    }
    if (idea.sensitiveActions.includes("PRIX") && idea.confidence < 60) {
      ignoredRisks.push("Confiance insuffisante pour toucher aux prix");
      adjusted = "A_EVITER";
    }
    if (!idea.hypothesisIds.length) {
      ignoredRisks.push("Aucune hypothèse liée");
    }
    const dataSufficient =
      idea.confidence >= 50 && ignoredRisks.length === 0 && idea.verdict !== "A_EVITER";

    return {
      ideaId: idea.id,
      dataSufficient,
      ignoredRisks,
      betterAlternatives,
      notes:
        adjusted !== idea.verdict
          ? `Verdict ajusté ${idea.verdict} → ${adjusted} après critique.`
          : "Critique OK — proposition cohérente avec les garde-fous.",
      adjustedVerdict: adjusted !== idea.verdict ? adjusted : undefined,
    };
  });
}

export function applyCritiques(ideas: BiIdea[], critiques: BiCritique[]): BiIdea[] {
  const map = new Map(critiques.map((c) => [c.ideaId, c]));
  return ideas.map((idea) => {
    const c = map.get(idea.id);
    if (!c?.adjustedVerdict) return idea;
    return { ...idea, verdict: c.adjustedVerdict, requiresHumanValidation: true };
  });
}
