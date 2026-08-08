/**
 * Exécuteurs d'outils Admin A.V.A. — sources réelles uniquement.
 */
import { roleAtLeast } from "@/lib/admin/roles";
import {
  buildGestionSnapshot,
  buildPriorityActions,
  type GestionLink,
} from "@/lib/ava-gestion/analytics";
import {
  formatMoneyEur,
  parsePeriodFromText,
  resolvePeriod,
  type DatePeriod,
} from "@/lib/timezone/shop-tz";
import { getReportSettings } from "@/lib/settings/app-settings";
import { getFidelatooStatus } from "@/lib/fidelatoo/orchestrator";
import prisma from "@/lib/prisma";
import type {
  AvaAdminToolContext,
  AvaAdminToolName,
  AvaAdminToolResult,
} from "./types";
import { sanitizeAdminToolError } from "./sanitize-error";
function hideFinance(role: string) {
  return !roleAtLeast(role, "ADMIN");
}

function matchStore(name: string, storeQuery?: string | null): boolean {
  if (!storeQuery) return true;
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const q = storeQuery
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return n.includes(q) || q.includes(n);
}

async function resolvePeriodCtx(ctx: AvaAdminToolContext) {
  const settings = await getReportSettings();
  const tz = settings.timezone;
  const key = (ctx.periodKey as DatePeriod | undefined) || parsePeriodFromText("aujourd'hui");
  return resolvePeriod(key || "today", tz);
}

function okResult(
  tool: AvaAdminToolName,
  title: string,
  text: string,
  extra?: Partial<AvaAdminToolResult>
): AvaAdminToolResult {
  return { ok: true, tool, title, text, links: [], missingData: [], ...extra };
}

function failResult(tool: AvaAdminToolName, title: string, reason: string): AvaAdminToolResult {
  const safe = sanitizeAdminToolError(reason);
  return {
    ok: false,
    tool,
    title,
    text: `${title} indisponible pour le moment (${safe}).`,
    error: safe,
    missingData: [tool],
  };
}

export async function execDailySummary(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const period = await resolvePeriodCtx(ctx);
    const s = await buildGestionSnapshot(period);
    const finance = hideFinance(ctx.role)
      ? []
      : [
          `CA confirmé : ${s.revenue.confirmedLabel}`,
          `Panier moyen : ${s.revenue.averageBasketLabel ?? "n/a"}`,
        ];
    const text = [
      `Résumé — ${s.period.label}`,
      `Commandes reçues : ${s.orders.received} · payées : ${s.orders.paid} · paiement en attente : ${s.orders.pendingPayment}`,
      ...finance,
      `Préparation : ${s.preparation.toPrepare} à préparer · ${s.preparation.preparing} en cours · ${s.preparation.prepared} prêtes`,
      `Livraisons : ${s.shipping.shipped} expédiées · ${s.shipping.atRelay} en relais · ${s.shipping.delivered} livrées · ${s.shipping.anomalies} anomalies`,
      `Alertes : ${s.alerts.stockIssues} stocks · ${s.alerts.paymentsToCheck.length} paiements · ${s.emails.failed} e-mails en erreur`,
      s.lastSyncAt ? `Dernière sync : ${s.lastSyncAt}` : "Dernière sync : non disponible",
    ].join("\n");

    const links: GestionLink[] = s.preparation.orderIds.slice(0, 8).map((o) => ({
      label: o.id,
      href: `/admin/orders/${o.id}`,
      kind: "order",
    }));

    return okResult("getDailySummary", "Résumé du jour", text, {
      links,
      periodLabel: s.period.label,
      missingData: s.missing.slice(0, 5),
      data: {
        ordersReceived: s.orders.received,
        toPrepare: s.preparation.toPrepare,
        stockIssues: s.alerts.stockIssues,
      },
    });
  } catch (e) {
    return failResult(
      "getDailySummary",
      "Résumé du jour",
      e instanceof Error ? "données période indisponibles" : "erreur lecture"
    );
  }
}

export async function execStockReport(
  ctx: AvaAdminToolContext,
  lowOnly = false
): Promise<AvaAdminToolResult> {
  const tool: AvaAdminToolName = lowOnly ? "getLowStockReport" : "getStockReport";
  const title = lowOnly ? "Stocks faibles" : "Rapport stocks";
  try {
    const limit = Math.min(Math.max(ctx.limit || (lowOnly ? 20 : 15), 1), 40);
    const levels = await prisma.stockLevel.findMany({
      where: {
        OR: [
          { availableQuantity: { lte: 5 } },
          { quantity: { lt: 0 } },
          { availableQuantity: { lt: 0 } },
        ],
      },
      take: 200,
      include: {
        product: { select: { id: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: { availableQuantity: "asc" },
    });

    const filtered = levels.filter((sl) =>
      matchStore(sl.location?.name || sl.location?.code || "", ctx.storeQuery)
    );

    const low: typeof filtered = [];
    const out: typeof filtered = [];
    const negative: typeof filtered = [];
    for (const sl of filtered) {
      if (!sl.product) continue;
      if (sl.availableQuantity < 0 || sl.quantity < 0) negative.push(sl);
      else if (sl.availableQuantity === 0) out.push(sl);
      else if (sl.availableQuantity <= (sl.lowStockThreshold || 5)) low.push(sl);
      else if (sl.availableQuantity <= 5) low.push(sl);
    }

    const storeLabel = ctx.storeQuery ? ` — filtre boutique « ${ctx.storeQuery} »` : "";
    const lines: string[] = [
      `${title}${storeLabel}`,
      `Faibles : ${low.length} · Ruptures : ${out.length} · Négatifs : ${negative.length}`,
    ];

    const show = lowOnly
      ? [...negative, ...out, ...low].slice(0, limit)
      : [...negative, ...out, ...low].slice(0, limit);

    if (show.length === 0) {
      lines.push(
        ctx.storeQuery
          ? `Aucun stock faible trouvé pour « ${ctx.storeQuery} » dans les données actuelles.`
          : "Aucun stock faible / rupture détecté sur le seuil actuel."
      );
    } else {
      lines.push("Détail (plus urgents d'abord) :");
      for (const sl of show) {
        const loc = sl.location?.name || sl.location?.code || "?";
        lines.push(
          `· ${sl.product!.name} — ${sl.availableQuantity} dispo @ ${loc}`
        );
      }
      if ((low.length + out.length + negative.length) > limit) {
        lines.push(`… et ${low.length + out.length + negative.length - limit} autre(s).`);
      }
    }

    const links: GestionLink[] = show.slice(0, 12).map((sl) => ({
      label: sl.product!.name,
      href: `/admin/stocks?q=${encodeURIComponent(sl.product!.name)}`,
      kind: "product",
    }));

    return okResult(tool, title, lines.join("\n"), {
      links,
      data: {
        low: low.length,
        out: out.length,
        negative: negative.length,
        storeQuery: ctx.storeQuery || null,
      },
    });
  } catch {
    return failResult(tool, title, "lecture StockLevel indisponible");
  }
}

export async function execInventoryReport(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const sessions = await prisma.inventorySession.findMany({
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: {
        location: { select: { name: true, code: true } },
        _count: { select: { lines: true } },
      },
    });

    const filtered = sessions.filter((s) =>
      matchStore(s.location?.name || s.location?.code || "", ctx.storeQuery)
    );

    const open = filtered.filter((s) => s.status === "OPEN").length;
    const completed = filtered.filter((s) =>
      ["COMPLETED", "VALIDATED", "CORRECTED"].includes(s.status)
    ).length;

    const lines = [
      `Inventaires${ctx.storeQuery ? ` — ${ctx.storeQuery}` : ""}`,
      `Sessions récentes analysées : ${filtered.length}`,
      `Ouvertes : ${open} · Terminées/validées : ${completed}`,
      ``,
      ...filtered.slice(0, 8).map((s) => {
        const loc = s.location?.name || s.location?.code || "?";
        const when = s.updatedAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
        return `· ${loc} — ${s.status} — ${s._count.lines} ligne(s) — ${s.employeeName} — ${when}`;
      }),
    ];

    if (filtered.length === 0) {
      lines.push("Aucune session d'inventaire trouvée pour ce filtre.");
    }

    return okResult("getInventoryReport", "Rapport inventaire", lines.join("\n"), {
      links: [{ label: "Inventaires", href: "/admin/inventaires", kind: "report" }],
      data: { open, completed, total: filtered.length },
    });
  } catch {
    return failResult("getInventoryReport", "Rapport inventaire", "sessions inventaire indisponibles");
  }
}

export async function execOrdersReport(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const period = await resolvePeriodCtx(ctx);
    const s = await buildGestionSnapshot(period);
    const limit = Math.min(Math.max(ctx.limit || 10, 1), 25);

    const lines = [
      `Commandes — ${s.period.label}`,
      `Reçues : ${s.orders.received} · payées : ${s.orders.paid} · en attente paiement : ${s.orders.pendingPayment} · annulées : ${s.orders.cancelled}`,
      `À préparer : ${s.preparation.toPrepare} · en préparation : ${s.preparation.preparing} · prêtes : ${s.preparation.prepared}`,
      `Paiements à vérifier : ${s.alerts.paymentsToCheck.length}`,
    ];

    if (s.preparation.orderIds.length) {
      lines.push(`Commandes à préparer (max ${limit}) :`);
      for (const o of s.preparation.orderIds.slice(0, limit)) {
        lines.push(`· ${o.id} (${o.status})`);
      }
    } else {
      lines.push("Aucune commande en file de préparation pour l'instant.");
    }

    if (!hideFinance(ctx.role)) {
      lines.push(`CA confirmé période : ${s.revenue.confirmedLabel}`);
    }

    const links: GestionLink[] = s.preparation.orderIds.slice(0, limit).map((o) => ({
      label: o.id,
      href: `/admin/orders/${o.id}`,
      kind: "order",
    }));

    return okResult("getOrdersReport", "Rapport commandes", lines.join("\n"), {
      links,
      periodLabel: s.period.label,
      data: {
        toPrepare: s.preparation.toPrepare,
        pendingPayment: s.orders.pendingPayment,
      },
    });
  } catch {
    return failResult("getOrdersReport", "Rapport commandes", "snapshot commandes indisponible");
  }
}

export async function execCatalogAudit(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const [byStatus, noRange, noManufacturer, manufacturers, ranges] = await Promise.all([
      prisma.product.groupBy({
        by: ["classificationStatus"],
        _count: { _all: true },
      }),
      prisma.product.count({
        where: { rangeId: null },
      }),
      prisma.product.count({
        where: { manufacturerId: null },
      }),
      prisma.manufacturer.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { ranges: true, products: true } },
        },
        take: 200,
      }),
      prisma.productRange.count(),
    ]);

    const statusLines = byStatus
      .map((r) => `· ${r.classificationStatus || "?"} : ${r._count._all}`)
      .sort();

    const mfrNoRange = manufacturers
      .filter((m) => m._count.ranges === 0 && m._count.products > 0)
      .slice(0, ctx.limit || 10);

    const unclassified =
      byStatus.find((s) => s.classificationStatus === "UNCLASSIFIED")?._count._all || 0;
    const toReview =
      byStatus.find((s) => s.classificationStatus === "TO_REVIEW")?._count._all || 0;

    const lines = [
      `Audit catalogue`,
      `Gammes totales : ${ranges}`,
      `Produits sans fabricant : ${noManufacturer}`,
      `Produits sans gamme : ${noRange}`,
      `Non classés (UNCLASSIFIED) : ${unclassified} · à revoir (TO_REVIEW) : ${toReview}`,
      `Répartition classification :`,
      ...statusLines,
    ];

    if (mfrNoRange.length) {
      lines.push(`Fabricants avec produits mais sans gamme (${mfrNoRange.length} listés) :`);
      for (const m of mfrNoRange) {
        lines.push(`· ${m.name} — ${m._count.products} produit(s)`);
      }
    }

    return okResult("getCatalogAudit", "Audit catalogue", lines.join("\n"), {
      links: [{ label: "Catalogue admin", href: "/admin/catalog", kind: "report" }],
      data: { noRange, noManufacturer, unclassified, toReview },
    });
  } catch {
    return failResult("getCatalogAudit", "Audit catalogue", "lecture catalogue indisponible");
  }
}

export async function execAvaStatus(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const status = await getFidelatooStatus();
    const text = [
      `Statut A.V.A. / systèmes`,
      `Session : ${ctx.email} · rôle ${ctx.appRole} (${ctx.role})`,
      `Orchestrateur configuré : ${status.orchestratorConfigured ? "oui" : "non"}`,
      `Orchestrateur joignable : ${status.orchestratorReachable ? "oui" : "non"}`,
      `VM : ${status.vm} · App : ${status.app} · A.V.A. agent : ${status.ava}`,
      `Rôle agent : ${status.role}`,
      `QR dispo : ${status.qrAvailable ? "oui" : "non"}`,
      status.lastError ? `Dernier signal : ${String(status.lastError).slice(0, 160)}` : "Pas d'erreur récente signalée",
    ].join("\n");

    return okResult("getAvaStatus", "Statut A.V.A.", text, {
      links: [
        { label: "Centre de contrôle", href: "/admin/fidelatoo/control-center", kind: "alert" },
      ],
      data: {
        vm: status.vm,
        reachable: status.orchestratorReachable,
      },
    });
  } catch {
    return failResult("getAvaStatus", "Statut A.V.A.", "statut orchestrateur indisponible");
  }
}

export async function execFidelatooStatus(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  // Même source que Ava status — libellé dédié pour les demandes Fidelatoo / VM
  const base = await execAvaStatus(ctx);
  if (!base.ok) {
    return { ...base, tool: "getFidelatooStatus", title: "Statut Fidelatoo / VM" };
  }
  return {
    ...base,
    tool: "getFidelatooStatus",
    title: "Statut Fidelatoo / VM",
    text: base.text.replace("Statut A.V.A. / systèmes", "Statut Fidelatoo / VM Android"),
  };
}

export async function execListCapabilities(_ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  const text = [
    `En gros : je regarde les chiffres, les stocks, les commandes, le catalogue, la VM / Fidelatoo, et je te ramène l'essentiel.`,
    `Je peux aussi faire le tour du magasin, sortir des anomalies, proposer des idées (sans brader par défaut), simuler un « et si… », et surveiller le marché public.`,
    `Parle normalement — « stocks faibles Hautmont », « qu'est-ce qui cloche », « et si on faisait -30 % ».`,
    `Prix / promos / commandes / DNS : je prépare, tu valides.`,
  ].join("\n");
  return okResult("listCapabilities", "Capacités", text);
}

export async function execDailyTour(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const {
      runBusinessIntelligence,
      formatTourForChat,
    } = await import("@/lib/ava/business-intelligence");
    const bundle = await runBusinessIntelligence({
      ownerUserId: ctx.userId || null,
      includeMarket: false,
      persist: Boolean(ctx.userId),
    });
    const text = formatTourForChat(bundle.tour!, { short: false });
    return okResult("runDailyTour", "Tour du magasin", text, {
      missingData: bundle.missingData.slice(0, 8),
      links: [
        { label: "Réflexions A.V.A.", href: "/admin/ava/reflections", kind: "alert" },
        { label: "Radar marché", href: "/admin/ava/radar", kind: "alert" },
      ],
      data: {
        stops: bundle.tour?.stops.length || 0,
        anomalies: bundle.anomalies.length,
        ideas: bundle.ideas.length,
      },
    });
  } catch (e) {
    return failResult(
      "runDailyTour",
      "Tour du magasin",
      e instanceof Error ? e.message : "analyse indisponible"
    );
  }
}

export async function execAnomalyScan(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const { runBusinessIntelligence } = await import("@/lib/ava/business-intelligence");
    const bundle = await runBusinessIntelligence({
      ownerUserId: ctx.userId || null,
      persist: Boolean(ctx.userId),
    });
    if (!bundle.anomalies.length) {
      return okResult(
        "runAnomalyScan",
        "Anomalies",
        "Aucune anomalie marquante sur les données disponibles. Je reste prudente : absence de signal ≠ tout va parfaitement.",
        { missingData: bundle.missingData.slice(0, 6) }
      );
    }
    const lines = bundle.anomalies.slice(0, 8).map((a, i) => {
      const p = a.priority;
      return `${i + 1}. [${a.severity}] ${a.title}\n   ${a.text}\n   Impact ${p.impact}/5 · Urgence ${p.urgency}/5 · Confiance ${p.confidence}%`;
    });
    return okResult("runAnomalyScan", "Anomalies", lines.join("\n\n"), {
      missingData: bundle.missingData.slice(0, 6),
      data: { count: bundle.anomalies.length },
    });
  } catch (e) {
    return failResult(
      "runAnomalyScan",
      "Anomalies",
      e instanceof Error ? e.message : "scan indisponible"
    );
  }
}

export async function execBusinessReflections(
  ctx: AvaAdminToolContext
): Promise<AvaAdminToolResult> {
  try {
    const {
      runBusinessIntelligence,
      formatReflectionsForChat,
      listReflections,
    } = await import("@/lib/ava/business-intelligence");
    const bundle = await runBusinessIntelligence({
      ownerUserId: ctx.userId || null,
      persist: Boolean(ctx.userId),
    });
    const cards = bundle.reflections.length
      ? bundle.reflections
      : ctx.userId
        ? await listReflections(ctx.userId)
        : [];
    return okResult(
      "getBusinessReflections",
      "Réflexions métier",
      formatReflectionsForChat(cards),
      {
        links: [{ label: "Réflexions A.V.A.", href: "/admin/ava/reflections", kind: "alert" }],
        data: { count: cards.length },
      }
    );
  } catch (e) {
    return failResult(
      "getBusinessReflections",
      "Réflexions métier",
      e instanceof Error ? e.message : "indisponible"
    );
  }
}

export async function execMarketRadar(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  try {
    const { gatherMarketRadar, saveMarketSignals } = await import(
      "@/lib/ava/business-intelligence"
    );
    const { signals, missingData } = await gatherMarketRadar();
    if (ctx.userId) await saveMarketSignals(ctx.userId, signals);
    const lines = signals.slice(0, 10).map((s, i) => {
      return (
        `${i + 1}. [${s.category}] ${s.title}\n` +
        `   ${s.information}\n` +
        `   Source : ${s.source} · confiance ${s.confidence}% · import auto : jamais`
      );
    });
    return okResult(
      "getMarketRadar",
      "Radar marché",
      lines.join("\n\n") || "Aucun signal marché pour l'instant.",
      {
        missingData,
        links: [{ label: "Radar marché", href: "/admin/ava/radar", kind: "alert" }],
        data: { count: signals.length },
      }
    );
  } catch (e) {
    return failResult(
      "getMarketRadar",
      "Radar marché",
      e instanceof Error ? e.message : "veille indisponible"
    );
  }
}

export async function execProposeBusinessIdeas(
  ctx: AvaAdminToolContext
): Promise<AvaAdminToolResult> {
  try {
    const { runBusinessIntelligence, formatIdeasForChat } = await import(
      "@/lib/ava/business-intelligence"
    );
    const bundle = await runBusinessIntelligence({
      ownerUserId: ctx.userId || null,
      persist: Boolean(ctx.userId),
    });
    const text = [
      "Idées métier (auto-critiquées) — pas de remise automatique :",
      "",
      formatIdeasForChat(bundle.ideas),
    ].join("\n");
    return okResult("proposeBusinessIdeas", "Idées métier", text, {
      missingData: bundle.missingData.slice(0, 6),
      data: {
        recommended: bundle.ideas.filter((i) => i.verdict === "RECOMMANDE").length,
        avoid: bundle.ideas.filter((i) => i.verdict === "A_EVITER").length,
      },
    });
  } catch (e) {
    return failResult(
      "proposeBusinessIdeas",
      "Idées métier",
      e instanceof Error ? e.message : "génération indisponible"
    );
  }
}

export async function execSimulateBusinessDecision(
  ctx: AvaAdminToolContext
): Promise<AvaAdminToolResult> {
  try {
    const { simulateDecision, formatSimulationForChat } = await import(
      "@/lib/ava/business-intelligence"
    );
    const historyTail = (ctx.history || [])
      .slice(-4)
      .map((h) => h.content)
      .join(" ");
    const proposal =
      (ctx.history || []).slice().reverse().find((h) => h.role === "user")?.content ||
      historyTail ||
      "Proposition non précisée";
    // Indices légers depuis un scan rapide (non bloquant si échec)
    let stockTight = false;
    let visibilityIssueSuspected = false;
    let conversionOk = false;
    try {
      const { collectObservations, detectAnomalies } = await import(
        "@/lib/ava/business-intelligence"
      );
      const obs = await collectObservations();
      const anoms = detectAnomalies(obs.observations);
      stockTight = anoms.some((a) => a.code.startsWith("STOCK_"));
      visibilityIssueSuspected = anoms.some((a) => /CATALOG|SALES/i.test(a.code));
      conversionOk = /conversion/i.test(proposal) || /conversion/i.test(historyTail);
    } catch {
      /* optional */
    }
    const sim = simulateDecision({
      proposal,
      stockTight,
      visibilityIssueSuspected,
      conversionOk,
    });
    return okResult(
      "simulateBusinessDecision",
      "Simulation décision",
      formatSimulationForChat(sim),
      {
        data: {
          sensitive: sim.sensitive,
          requiresHumanValidation: sim.requiresHumanValidation,
          confidence: sim.confidence,
        },
      }
    );
  } catch (e) {
    return failResult(
      "simulateBusinessDecision",
      "Simulation décision",
      e instanceof Error ? e.message : "simulation indisponible"
    );
  }
}

export async function execFullReport(ctx: AvaAdminToolContext): Promise<AvaAdminToolResult> {
  const parts = await Promise.all([
    execDailySummary(ctx),
    execStockReport(ctx, true),
    execInventoryReport(ctx),
    execOrdersReport(ctx),
    execCatalogAudit(ctx),
    execAvaStatus(ctx),
  ]);

  const missing = parts.filter((p) => !p.ok).map((p) => p.title);
  const alertBits: string[] = [];
  try {
    const actions = await buildPriorityActions();
    for (const a of actions.slice(0, 5)) {
      alertBits.push(`${a.rank}. ${a.text}`);
    }
  } catch {
    /* optional */
  }

  const sections = parts.map((p, i) => {
    const n = i + 1;
    if (!p.ok) return `${n}. ${p.title}\n- Indisponible : ${p.error || "erreur"}`;
    return `${n}. ${p.title}\n${p.text}`;
  });

  const text = [
    `Rapport global All Vap's`,
    ``,
    ...sections,
    ``,
    `${parts.length + 1}. Alertes / actions recommandées`,
    alertBits.length
      ? alertBits.join("\n")
      : "Aucune priorité automatique détectée pour l'instant.",
    missing.length
      ? `\nNote : ${missing.length} bloc(s) partiel(s) — le reste du rapport reste disponible.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const links = parts.flatMap((p) => p.links || []).slice(0, 20);

  return okResult("getFullReport", "Rapport global", text, {
    links,
    missingData: missing,
    data: {
      sectionsOk: parts.filter((p) => p.ok).length,
      sectionsFail: missing.length,
    },
  });
}

/** Format monétaire exposé aux tests locaux éventuels */
export { formatMoneyEur };
