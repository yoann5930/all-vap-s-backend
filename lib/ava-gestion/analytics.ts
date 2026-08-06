import type { OrderStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  formatMoneyEur,
  formatShopDateTime,
  type PeriodBounds,
} from "@/lib/timezone/shop-tz";

/** Statuts exclus du CA confirmé. */
const NON_REVENUE: OrderStatus[] = ["PENDING", "CANCELLED", "REFUNDED"];
const PAID_LIKE: OrderStatus[] = ["PAID", "PREPARING", "PREPARED", "SHIPPED", "AT_RELAY", "DELIVERED"];

export type GestionLink = {
  label: string;
  href: string;
  kind: "order" | "product" | "shipment" | "invoice" | "alert" | "report";
};

export type GestionSnapshot = {
  period: PeriodBounds;
  source: string;
  generatedAt: string;
  lastSyncAt: string | null;
  missing: string[];
  orders: {
    received: number;
    paid: number;
    pendingPayment: number;
    cancelled: number;
    refunded: number;
  };
  revenue: {
    confirmedCents: number;
    confirmedLabel: string;
    averageBasketCents: number | null;
    averageBasketLabel: string | null;
  };
  preparation: {
    toPrepare: number;
    preparing: number;
    prepared: number;
    blocked: number;
    orderIds: { id: string; status: string }[];
  };
  shipping: {
    shipped: number;
    atRelay: number;
    delivered: number;
    returned: number | null;
    anomalies: number;
    stale: { id: string; trackingNumber: string | null; days: number }[];
  };
  sales: {
    topProducts: { productId: string; name: string; qty: number; revenueCents: number }[];
    topCategories: { name: string; qty: number }[];
    promotionsUsed: number;
    gifts: number;
  };
  stock: {
    low: { productId: string; name: string; available: number }[];
    out: { productId: string; name: string }[];
    negative: { productId: string; name: string; available: number }[];
    soldWithoutStock: string | null;
  };
  documents: {
    orderForms: number;
    prepSlips: number;
    deliverySlips: number;
    invoices: number;
    invoicesMissing: { orderId: string }[];
  };
  emails: {
    sent: number;
    pending: number;
    failed: number;
    lastErrors: { id: string; type: string; error: string | null; at: string }[];
  };
  customers: {
    newAccounts: number;
    newWhoOrdered: number;
    returningWhoOrdered: number;
  };
  alerts: {
    paymentsToCheck: { orderId: string }[];
    blockedOrders: { orderId: string }[];
    stockIssues: number;
    emailErrors: number;
    shippingAnomalies: number;
  };
};

function orderWherePeriod(period: PeriodBounds, opts?: { includeAudit?: boolean }): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: period.start, lte: period.end },
    // Production : exclure les commandes AUDIT_ONLY
    ...(opts?.includeAudit ? {} : { isAudit: false }),
  };
}

async function lastRelevantSync(tz: string): Promise<string | null> {
  const run = await prisma.syncRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { completedAt: true, startedAt: true },
  });
  if (!run) return null;
  const d = run.completedAt || run.startedAt;
  return d ? formatShopDateTime(d, tz) : null;
}

export async function buildGestionSnapshot(period: PeriodBounds): Promise<GestionSnapshot> {
  const missing: string[] = [];
  const tz = period.timezone;
  const where = orderWherePeriod(period);

  const [
    orders,
    pendingOrders,
    cancelledOrders,
    refundedOrders,
    toPrepare,
    preparing,
    prepared,
    shipped,
    atRelay,
    delivered,
    docs,
    emailsSent,
    emailsPending,
    emailsFailed,
    emailErrors,
    newUsers,
    stockLevels,
    lastSync,
  ] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        status: true,
        totalCents: true,
        createdAt: true,
        userId: true,
        couponCode: true,
        trackingNumber: true,
        shippedAt: true,
        deliveredAt: true,
        updatedAt: true,
        items: {
          select: {
            quantity: true,
            priceCents: true,
            productId: true,
            product: { select: { name: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.count({ where: { ...where, status: "PENDING" } }),
    prisma.order.count({ where: { ...where, status: "CANCELLED" } }),
    prisma.order.count({ where: { ...where, status: "REFUNDED" } }),
    prisma.order.findMany({
      where: { status: "PAID", isAudit: false },
      select: { id: true, status: true },
      take: 50,
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.count({ where: { status: "PREPARING", isAudit: false } }),
    prisma.order.count({ where: { status: "PREPARED", isAudit: false } }),
    prisma.order.count({
      where: { status: "SHIPPED", isAudit: false, updatedAt: { gte: period.start } },
    }),
    prisma.order.count({ where: { status: "AT_RELAY", isAudit: false } }),
    prisma.order.count({
      where: {
        status: "DELIVERED",
        isAudit: false,
        deliveredAt: { gte: period.start, lte: period.end },
      },
    }),
    prisma.orderDocument.groupBy({
      by: ["type"],
      where: { createdAt: { gte: period.start, lte: period.end } },
      _count: true,
    }),
    prisma.emailLog.count({
      where: {
        status: "SENT",
        transport: { in: ["smtp", "resend"] },
        createdAt: { gte: period.start, lte: period.end },
      },
    }),
    prisma.emailLog.count({
      where: { status: "PENDING", createdAt: { gte: period.start, lte: period.end } },
    }),
    prisma.emailLog.count({
      where: { status: "FAILED", createdAt: { gte: period.start, lte: period.end } },
    }),
    prisma.emailLog.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, lastErrorCode: true, createdAt: true },
    }),
    prisma.user.count({
      where: {
        role: "CUSTOMER",
        createdAt: { gte: period.start, lte: period.end },
      },
    }),
    prisma.stockLevel.findMany({
      where: {
        OR: [{ availableQuantity: { lte: 5 } }, { quantity: { lt: 0 } }, { availableQuantity: { lt: 0 } }],
      },
      take: 40,
      include: { product: { select: { id: true, name: true } } },
    }),
    lastRelevantSync(tz),
  ]);

  const confirmedCents = orders
    .filter((o) => PAID_LIKE.includes(o.status))
    .reduce((s, o) => s + o.totalCents, 0);
  const paidCount = orders.filter((o) => PAID_LIKE.includes(o.status)).length;
  const avg = paidCount > 0 ? Math.round(confirmedCents / paidCount) : null;

  // Top produits
  const productMap = new Map<string, { productId: string; name: string; qty: number; revenueCents: number }>();
  const catMap = new Map<string, number>();
  let promotionsUsed = 0;
  let gifts = 0;
  for (const o of orders) {
    if (!PAID_LIKE.includes(o.status)) continue;
    if (o.couponCode) promotionsUsed += 1;
    for (const it of o.items) {
      if (it.priceCents === 0) gifts += it.quantity;
      const cur = productMap.get(it.productId) || {
        productId: it.productId,
        name: it.product.name,
        qty: 0,
        revenueCents: 0,
      };
      cur.qty += it.quantity;
      cur.revenueCents += it.priceCents * it.quantity;
      productMap.set(it.productId, cur);
      const cat = it.product.category || "Sans catégorie";
      catMap.set(cat, (catMap.get(cat) || 0) + it.quantity);
    }
  }

  const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topCategories = [...catMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  // Colis sans mouvement (> 3 jours)
  const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const staleOrders = await prisma.order.findMany({
    where: {
      status: { in: ["SHIPPED", "AT_RELAY"] },
      updatedAt: { lt: staleCutoff },
    },
    select: { id: true, trackingNumber: true, updatedAt: true },
    take: 20,
  });
  const stale = staleOrders.map((o) => ({
    id: o.id,
    trackingNumber: o.trackingNumber,
    days: Math.floor((Date.now() - o.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
  }));

  // Factures manquantes pour commandes payées de la période
  const paidIds = orders.filter((o) => PAID_LIKE.includes(o.status)).map((o) => o.id);
  let invoicesMissing: { orderId: string }[] = [];
  if (paidIds.length > 0) {
    const withInvoice = await prisma.orderDocument.findMany({
      where: { orderId: { in: paidIds }, type: "INVOICE" },
      select: { orderId: true },
    });
    const has = new Set(withInvoice.map((d) => d.orderId));
    invoicesMissing = paidIds.filter((id) => !has.has(id)).map((orderId) => ({ orderId }));
  }

  const docCount = (t: string) => docs.find((d) => d.type === t)?._count ?? 0;

  const low: GestionSnapshot["stock"]["low"] = [];
  const out: GestionSnapshot["stock"]["out"] = [];
  const negative: GestionSnapshot["stock"]["negative"] = [];
  for (const sl of stockLevels) {
    if (!sl.product) continue;
    if (sl.availableQuantity < 0 || sl.quantity < 0) {
      negative.push({
        productId: sl.product.id,
        name: sl.product.name,
        available: sl.availableQuantity,
      });
    } else if (sl.availableQuantity === 0) {
      out.push({ productId: sl.product.id, name: sl.product.name });
    } else if (sl.availableQuantity <= 5) {
      low.push({
        productId: sl.product.id,
        name: sl.product.name,
        available: sl.availableQuantity,
      });
    }
  }

  const newUserIds = await prisma.user.findMany({
    where: {
      role: "CUSTOMER",
      createdAt: { gte: period.start, lte: period.end },
    },
    select: { id: true },
  });
  const newSet = new Set(newUserIds.map((u) => u.id));
  const newWhoOrderedCount = new Set(
    orders.filter((o) => o.userId && newSet.has(o.userId) && PAID_LIKE.includes(o.status)).map((o) => o.userId!)
  ).size;
  const returningWhoOrdered = new Set(
    orders
      .filter((o) => o.userId && !newSet.has(o.userId) && PAID_LIKE.includes(o.status))
      .map((o) => o.userId!)
  ).size;

  // Retours transporteur : pas de statut dédié → indisponible
  missing.push("colis_retournes (statut transporteur non synchronisé)");
  missing.push("anomalies_transporteur (API transporteur non connectée — détection limitée aux colis sans MAJ)");
  missing.push("emails_sent_counts_only_smtp_or_resend (console/SKIPPED exclus)");

  const consoleSkipped = await prisma.emailLog.count({
    where: {
      OR: [
        { status: "SKIPPED", lastErrorCode: "CONSOLE_ONLY_NOT_DELIVERED" },
        { status: "SENT", transport: "console" },
      ],
      createdAt: { gte: period.start, lte: period.end },
    },
  });
  if (consoleSkipped > 0) {
    missing.push(`${consoleSkipped} e-mail(s) console/non livrés exclus des compteurs « envoyés »`);
  }

  const paymentsToCheck = orders.filter((o) => o.status === "PENDING").map((o) => ({ orderId: o.id }));

  void NON_REVENUE;

  return {
    period,
    source: "postgresql:Order,OrderItem,OrderDocument,EmailLog,StockLevel,User,SyncRun",
    generatedAt: formatShopDateTime(new Date(), tz),
    lastSyncAt: lastSync,
    missing,
    orders: {
      received: orders.length,
      paid: paidCount,
      pendingPayment: pendingOrders,
      cancelled: cancelledOrders,
      refunded: refundedOrders,
    },
    revenue: {
      confirmedCents,
      confirmedLabel: formatMoneyEur(confirmedCents),
      averageBasketCents: avg,
      averageBasketLabel: avg != null ? formatMoneyEur(avg) : null,
    },
    preparation: {
      toPrepare: toPrepare.length,
      preparing,
      prepared,
      blocked: 0,
      orderIds: toPrepare,
    },
    shipping: {
      shipped,
      atRelay,
      delivered,
      returned: null,
      anomalies: stale.length,
      stale,
    },
    sales: {
      topProducts,
      topCategories,
      promotionsUsed,
      gifts,
    },
    stock: {
      low,
      out,
      negative,
      soldWithoutStock: null,
    },
    documents: {
      orderForms: docCount("ORDER_FORM"),
      prepSlips: docCount("PREP_SLIP"),
      deliverySlips: docCount("DELIVERY_SLIP"),
      invoices: docCount("INVOICE"),
      invoicesMissing,
    },
    emails: {
      sent: emailsSent,
      pending: emailsPending,
      failed: emailsFailed,
      lastErrors: emailErrors.map((e) => ({
        id: e.id,
        type: e.type,
        error: e.lastErrorCode,
        at: formatShopDateTime(e.createdAt, tz),
      })),
    },
    customers: {
      newAccounts: newUsers,
      newWhoOrdered: newWhoOrderedCount,
      returningWhoOrdered,
    },
    alerts: {
      paymentsToCheck,
      blockedOrders: [],
      stockIssues: low.length + out.length + negative.length,
      emailErrors: emailsFailed,
      shippingAnomalies: stale.length,
    },
  };
}

export function compareSnapshots(
  current: GestionSnapshot,
  previous: GestionSnapshot
): {
  revenueDeltaCents: number;
  revenueDeltaPct: number | null;
  ordersDelta: number;
  avgBasketDeltaCents: number | null;
  factualNotes: string[];
} {
  const revenueDeltaCents = current.revenue.confirmedCents - previous.revenue.confirmedCents;
  const revenueDeltaPct =
    previous.revenue.confirmedCents > 0
      ? Math.round((revenueDeltaCents / previous.revenue.confirmedCents) * 1000) / 10
      : null;
  const ordersDelta = current.orders.paid - previous.orders.paid;
  const avgBasketDeltaCents =
    current.revenue.averageBasketCents != null && previous.revenue.averageBasketCents != null
      ? current.revenue.averageBasketCents - previous.revenue.averageBasketCents
      : null;

  const factualNotes: string[] = [];
  if (ordersDelta !== 0) {
    factualNotes.push(
      `${Math.abs(ordersDelta)} commande(s) payée(s) ${ordersDelta > 0 ? "de plus" : "de moins"}`
    );
  }
  if (avgBasketDeltaCents != null && avgBasketDeltaCents !== 0) {
    factualNotes.push(
      `panier moyen ${avgBasketDeltaCents > 0 ? "plus élevé" : "plus bas"} de ${formatMoneyEur(Math.abs(avgBasketDeltaCents))}`
    );
  }
  if (factualNotes.length === 0 && revenueDeltaCents === 0) {
    factualNotes.push("Aucun écart factuel détecté sur le CA et le volume.");
  }

  return { revenueDeltaCents, revenueDeltaPct, ordersDelta, avgBasketDeltaCents, factualNotes };
}

export type PriorityAction = {
  rank: number;
  text: string;
  links: GestionLink[];
  rule: string;
};

export async function buildPriorityActions(): Promise<PriorityAction[]> {
  const actions: PriorityAction[] = [];

  const toPrepare = await prisma.order.findMany({
    where: { status: "PAID", isAudit: false },
    select: { id: true },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  if (toPrepare.length > 0) {
    const ids = toPrepare.map((o) => o.id);
    actions.push({
      rank: actions.length + 1,
      text: `Préparer les commandes ${ids.join(", ")}.`,
      links: ids.map((id) => ({
        label: id,
        href: `/admin/orders/${id}`,
        kind: "order" as const,
      })),
      rule: "commande_payee_non_preparee",
    });
  }

  const pending = await prisma.order.findMany({
    where: { status: "PENDING" },
    select: { id: true },
    take: 5,
    orderBy: { createdAt: "asc" },
  });
  for (const o of pending) {
    actions.push({
      rank: actions.length + 1,
      text: `Vérifier le paiement de la commande ${o.id}.`,
      links: [{ label: o.id, href: `/admin/orders/${o.id}`, kind: "order" }],
      rule: "paiement_en_attente",
    });
  }

  const neg = await prisma.stockLevel.findMany({
    where: { OR: [{ availableQuantity: { lt: 0 } }, { quantity: { lt: 0 } }] },
    take: 5,
    include: { product: { select: { id: true, name: true } } },
  });
  for (const s of neg) {
    if (!s.product) continue;
    actions.push({
      rank: actions.length + 1,
      text: `Corriger le stock négatif du produit ${s.product.name}.`,
      links: [
        {
          label: s.product.name,
          href: `/admin/stocks?q=${encodeURIComponent(s.product.name)}`,
          kind: "product",
        },
      ],
      rule: "stock_negatif",
    });
  }

  const paidRecent = await prisma.order.findMany({
    where: { status: { in: PAID_LIKE }, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    select: { id: true },
    take: 30,
  });
  if (paidRecent.length > 0) {
    const withInv = await prisma.orderDocument.findMany({
      where: { orderId: { in: paidRecent.map((o) => o.id) }, type: "INVOICE" },
      select: { orderId: true },
    });
    const has = new Set(withInv.map((d) => d.orderId));
    const missing = paidRecent.filter((o) => !has.has(o.id)).slice(0, 3);
    for (const o of missing) {
      actions.push({
        rank: actions.length + 1,
        text: `Générer / renvoyer la facture de la commande ${o.id}.`,
        links: [{ label: o.id, href: `/admin/orders/${o.id}`, kind: "invoice" }],
        rule: "facture_manquante",
      });
    }
  }

  const failedEmails = await prisma.emailLog.count({
    where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 2 * 86400000) } },
  });
  if (failedEmails > 0) {
    actions.push({
      rank: actions.length + 1,
      text: `Traiter ${failedEmails} e-mail(s) en échec (48 h).`,
      links: [{ label: "E-mails", href: "/admin/emails?filter=errors", kind: "alert" }],
      rule: "email_echec",
    });
  }

  const staleCutoff = new Date(Date.now() - 3 * 86400000);
  const stale = await prisma.order.findMany({
    where: { status: { in: ["SHIPPED", "AT_RELAY"] }, updatedAt: { lt: staleCutoff } },
    select: { id: true, trackingNumber: true },
    take: 3,
  });
  for (const o of stale) {
    actions.push({
      rank: actions.length + 1,
      text: `Vérifier le colis ${o.trackingNumber || o.id}, sans mise à jour depuis plusieurs jours.`,
      links: [{ label: o.id, href: `/admin/orders/${o.id}`, kind: "shipment" }],
      rule: "colis_bloque",
    });
  }

  return actions.slice(0, 10).map((a, i) => ({ ...a, rank: i + 1 }));
}
