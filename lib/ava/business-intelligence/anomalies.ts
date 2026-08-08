import { randomBytes } from "crypto";
import type { BiAnomaly, BiObservation, BiPriorityScore } from "./types";

function id() {
  return `anom_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

function priority(
  impact: BiPriorityScore["impact"],
  urgency: BiPriorityScore["urgency"],
  confidence: number,
  effort: BiPriorityScore["effort"] = 2
): BiPriorityScore {
  return { impact, urgency, confidence, effort };
}

/**
 * Détection d'anomalies déterministe à partir d'observations réelles.
 * Pas de seuils magiques seuls : compare aussi les métriques entre elles.
 */
export function detectAnomalies(observations: BiObservation[]): BiAnomaly[] {
  const out: BiAnomaly[] = [];
  const bySubject = new Map(observations.map((o) => [o.subject, o]));

  const stock = bySubject.get("stock_alertes");
  if (stock?.metrics) {
    const neg = Number(stock.metrics.negative || 0);
    const outOf = Number(stock.metrics.out || 0);
    const low = Number(stock.metrics.low || 0);
    if (neg > 0) {
      out.push({
        id: id(),
        code: "STOCK_NEGATIVE",
        title: "Stocks négatifs",
        severity: "high",
        observationIds: [stock.id],
        text: `${neg} produit(s) en stock négatif — risque opérationnel immédiat.`,
        priority: priority(5, 5, 90, 2),
      });
    }
    if (outOf >= 8) {
      out.push({
        id: id(),
        code: "STOCK_OUT_CLUSTER",
        title: "Ruptures nombreuses",
        severity: "high",
        observationIds: [stock.id],
        text: `${outOf} ruptures détectées — possible frein ventes / insatisfaction.`,
        priority: priority(4, 4, 85, 3),
      });
    } else if (low >= 12) {
      out.push({
        id: id(),
        code: "STOCK_LOW_CLUSTER",
        title: "Stocks faibles concentrés",
        severity: "medium",
        observationIds: [stock.id],
        text: `${low} références sous seuil — risque de rupture prochaine.`,
        priority: priority(3, 4, 80, 2),
      });
    }
  }

  const sales = bySubject.get("ventes_periode");
  const cmp = bySubject.get("comparaison_periode");
  if (sales?.metrics && cmp?.metrics) {
    const paid = Number(sales.metrics.paid || 0);
    const delta = Number(cmp.metrics.ordersDelta || 0);
    const revPct = cmp.metrics.revenueDeltaPct;
    if (paid === 0 && Number(sales.metrics.received || 0) === 0) {
      out.push({
        id: id(),
        code: "SALES_FLAT_ZERO",
        title: "Aucune vente sur la période",
        severity: "medium",
        observationIds: [sales.id],
        text: "Aucune commande reçue/payée sur la période observée — à confirmer (jour calme vs problème tunnel).",
        priority: priority(3, 3, 70, 2),
      });
    }
    if (typeof revPct === "number" && revPct <= -25 && paid > 0) {
      out.push({
        id: id(),
        code: "SALES_DROP",
        title: "Baisse CA inhabituelle",
        severity: "high",
        observationIds: [sales.id, cmp.id],
        text: `CA en baisse d'environ ${Math.abs(revPct)} % vs période précédente (${delta} commandes payées en écart).`,
        priority: priority(5, 4, 75, 3),
      });
    } else if (delta <= -5 && paid > 0) {
      out.push({
        id: id(),
        code: "ORDERS_DROP",
        title: "Baisse du volume de commandes",
        severity: "medium",
        observationIds: [sales.id, cmp.id],
        text: `Volume payé en baisse (${delta} vs période précédente).`,
        priority: priority(4, 3, 72, 2),
      });
    }
  }

  const catalog = bySubject.get("classification");
  if (catalog?.metrics) {
    const uncl = Number(catalog.metrics.unclassified || 0);
    const noRange = Number(catalog.metrics.noRange || 0);
    if (uncl >= 50 || noRange >= 50) {
      out.push({
        id: id(),
        code: "CATALOG_BACKLOG",
        title: "Retard de classification catalogue",
        severity: "medium",
        observationIds: [catalog.id],
        text: `${uncl} non classés / ${noRange} sans gamme — impact possible sur visibilité et A.V.A. vendeuse.`,
        priority: priority(3, 2, 88, 4),
      });
    }
  }

  const prep = bySubject.get("ventes_periode");
  if (prep?.metrics && Number(prep.metrics.toPrepare || 0) >= 5) {
    out.push({
      id: id(),
      code: "PREP_BACKLOG",
      title: "File de préparation chargée",
      severity: "medium",
      observationIds: [prep.id],
      text: `${prep.metrics.toPrepare} commande(s) à préparer.`,
      priority: priority(4, 4, 92, 2),
    });
  }

  // Tri : impact*urgency*confidence
  return out.sort(
    (a, b) =>
      b.priority.impact * b.priority.urgency * b.priority.confidence -
      a.priority.impact * a.priority.urgency * a.priority.confidence
  );
}
