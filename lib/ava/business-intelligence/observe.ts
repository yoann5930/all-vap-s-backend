import { randomBytes } from "crypto";
import {
  buildGestionSnapshot,
  buildPriorityActions,
  compareSnapshots,
} from "@/lib/ava-gestion/analytics";
import { resolvePeriod, type DatePeriod } from "@/lib/timezone/shop-tz";
import { getReportSettings } from "@/lib/settings/app-settings";
import prisma from "@/lib/prisma";
import type { BiObservation } from "./types";

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

export async function observeSales(periodKey: DatePeriod = "today"): Promise<{
  observations: BiObservation[];
  missingData: string[];
}> {
  try {
    const settings = await getReportSettings();
    const period = resolvePeriod(periodKey, settings.timezone);
    const prevKey: DatePeriod =
      periodKey === "today"
        ? "yesterday"
        : periodKey === "this_week"
          ? "last_week"
          : periodKey === "this_month"
            ? "last_month"
            : "yesterday";
    const prev = resolvePeriod(prevKey, settings.timezone);
    const [cur, previous] = await Promise.all([
      buildGestionSnapshot(period),
      buildGestionSnapshot(prev),
    ]);
    const cmp = compareSnapshots(cur, previous);
    const observations: BiObservation[] = [
      {
        id: id("obs"),
        kind: "sales",
        subject: "ventes_periode",
        text: `Période ${cur.period.label} : ${cur.orders.paid} commandes payées, CA ${cur.revenue.confirmedLabel}, panier moyen ${cur.revenue.averageBasketLabel ?? "n/a"}.`,
        metrics: {
          paid: cur.orders.paid,
          received: cur.orders.received,
          pendingPayment: cur.orders.pendingPayment,
          revenueCents: cur.revenue.confirmedCents,
          toPrepare: cur.preparation.toPrepare,
        },
        periodLabel: cur.period.label,
        source: cur.source,
        observedAt: new Date().toISOString(),
      },
      {
        id: id("obs"),
        kind: "sales",
        subject: "comparaison_periode",
        text: `Vs ${previous.period.label} : Δ commandes payées ${cmp.ordersDelta >= 0 ? "+" : ""}${cmp.ordersDelta}${
          cmp.revenueDeltaPct != null ? ` · Δ CA ${cmp.revenueDeltaPct > 0 ? "+" : ""}${cmp.revenueDeltaPct}%` : ""
        }.`,
        metrics: {
          ordersDelta: cmp.ordersDelta,
          revenueDeltaPct: cmp.revenueDeltaPct,
        },
        periodLabel: `${cur.period.label} vs ${previous.period.label}`,
        source: "compareSnapshots",
        observedAt: new Date().toISOString(),
      },
    ];

    if (cur.sales.topProducts.length) {
      observations.push({
        id: id("obs"),
        kind: "sales",
        subject: "top_produits",
        text: `Top produits : ${cur.sales.topProducts
          .slice(0, 5)
          .map((p) => `${p.name}×${p.qty}`)
          .join(" · ")}.`,
        metrics: { topCount: cur.sales.topProducts.length },
        periodLabel: cur.period.label,
        source: cur.source,
        observedAt: new Date().toISOString(),
      });
    }

    return { observations, missingData: cur.missing.slice(0, 8) };
  } catch (e) {
    console.error(
      "[ava.bi] observeSales failed",
      e instanceof Error ? e.message.slice(0, 300) : e
    );
    return {
      observations: [],
      missingData: ["ventes_indisponibles"],
    };
  }
}

export async function observeStock(): Promise<{
  observations: BiObservation[];
  missingData: string[];
}> {
  try {
    const settings = await getReportSettings();
    const period = resolvePeriod("today", settings.timezone);
    const snap = await buildGestionSnapshot(period);
    const observations: BiObservation[] = [
      {
        id: id("obs"),
        kind: "stock",
        subject: "stock_alertes",
        text: `Stocks : ${snap.stock.low.length} faibles, ${snap.stock.out.length} ruptures, ${snap.stock.negative.length} négatifs.`,
        metrics: {
          low: snap.stock.low.length,
          out: snap.stock.out.length,
          negative: snap.stock.negative.length,
          stockIssues: snap.alerts.stockIssues,
        },
        source: snap.source,
        observedAt: new Date().toISOString(),
      },
    ];
    if (snap.stock.negative[0]) {
      observations.push({
        id: id("obs"),
        kind: "stock",
        subject: "stock_negatif",
        text: `Stock négatif détecté : ${snap.stock.negative
          .slice(0, 5)
          .map((p) => `${p.name} (${p.available})`)
          .join(" · ")}.`,
        source: snap.source,
        observedAt: new Date().toISOString(),
      });
    }
    if (snap.stock.low[0]) {
      observations.push({
        id: id("obs"),
        kind: "stock",
        subject: "stock_faible",
        text: `Stocks faibles urgents : ${snap.stock.low
          .slice(0, 6)
          .map((p) => `${p.name} (${p.available})`)
          .join(" · ")}.`,
        source: snap.source,
        observedAt: new Date().toISOString(),
      });
    }
    return { observations, missingData: snap.missing.slice(0, 5) };
  } catch (e) {
    console.error(
      "[ava.bi] observeStock failed",
      e instanceof Error ? e.message.slice(0, 300) : e
    );
    return { observations: [], missingData: ["stocks_indisponibles"] };
  }
}

export async function observeCatalog(): Promise<{
  observations: BiObservation[];
  missingData: string[];
}> {
  const missing: string[] = [];
  try {
    const [byStatus, noRange, noMfr] = await Promise.all([
      prisma.product.groupBy({ by: ["classificationStatus"], _count: { _all: true } }),
      prisma.product.count({ where: { rangeId: null } }),
      prisma.product.count({ where: { manufacturerId: null } }),
    ]);
    const unclassified =
      byStatus.find((s) => s.classificationStatus === "UNCLASSIFIED")?._count._all || 0;
    const toReview =
      byStatus.find((s) => s.classificationStatus === "TO_REVIEW")?._count._all || 0;
    return {
      observations: [
        {
          id: id("obs"),
          kind: "catalog",
          subject: "classification",
          text: `Catalogue : ${unclassified} non classés, ${toReview} à revoir, ${noMfr} sans fabricant, ${noRange} sans gamme.`,
          metrics: { unclassified, toReview, noManufacturer: noMfr, noRange },
          source: "postgresql:Product",
          observedAt: new Date().toISOString(),
        },
      ],
      missingData: missing,
    };
  } catch {
    return {
      observations: [],
      missingData: ["catalogue_indisponible"],
    };
  }
}

export async function observeOpsPriorities(): Promise<{
  observations: BiObservation[];
  missingData: string[];
}> {
  try {
    const actions = await buildPriorityActions();
    if (!actions.length) {
      return {
        observations: [
          {
            id: id("obs"),
            kind: "other",
            subject: "priorites",
            text: "Aucune action prioritaire automatique détectée sur les données actuelles.",
            source: "buildPriorityActions",
            observedAt: new Date().toISOString(),
          },
        ],
        missingData: [],
      };
    }
    return {
      observations: [
        {
          id: id("obs"),
          kind: "other",
          subject: "priorites",
          text: `${actions.length} priorité(s) : ${actions
            .slice(0, 5)
            .map((a) => a.text)
            .join(" | ")}`,
          metrics: { count: actions.length },
          source: "buildPriorityActions",
          observedAt: new Date().toISOString(),
        },
      ],
      missingData: [],
    };
  } catch {
    return { observations: [], missingData: ["priorites_indisponibles"] };
  }
}

export async function collectObservations(opts?: {
  periodKey?: DatePeriod;
}): Promise<{ observations: BiObservation[]; missingData: string[] }> {
  try {
    const [sales, stock, catalog, ops] = await Promise.all([
      observeSales(opts?.periodKey || "today").catch(() => ({
        observations: [] as BiObservation[],
        missingData: ["ventes_indisponibles"],
      })),
      observeStock().catch(() => ({
        observations: [] as BiObservation[],
        missingData: ["stock_indisponible"],
      })),
      observeCatalog().catch(() => ({
        observations: [] as BiObservation[],
        missingData: ["catalogue_indisponible"],
      })),
      observeOpsPriorities().catch(() => ({
        observations: [] as BiObservation[],
        missingData: ["priorites_indisponibles"],
      })),
    ]);
    return {
      observations: [
        ...sales.observations,
        ...stock.observations,
        ...catalog.observations,
        ...ops.observations,
      ],
      missingData: [
        ...new Set([
          ...sales.missingData,
          ...stock.missingData,
          ...catalog.missingData,
          ...ops.missingData,
        ]),
      ],
    };
  } catch {
    return {
      observations: [],
      missingData: ["observations_indisponibles"],
    };
  }
}
