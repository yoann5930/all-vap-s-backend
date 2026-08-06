import { roleAtLeast } from "@/lib/admin/roles";
import {
  buildGestionSnapshot,
  buildPriorityActions,
  compareSnapshots,
  type GestionLink,
  type GestionSnapshot,
} from "@/lib/ava-gestion/analytics";
import {
  formatMoneyEur,
  parsePeriodFromText,
  resolvePeriod,
  type DatePeriod,
} from "@/lib/timezone/shop-tz";
import { getReportSettings } from "@/lib/settings/app-settings";
import prisma from "@/lib/prisma";

export type AvaGestionReply = {
  mode: "gestion";
  text: string;
  links: GestionLink[];
  snapshot?: GestionSnapshot;
  missingData: string[];
  periodLabel: string;
  source: string;
  lastSyncAt: string | null;
  generatedAt: string;
};

function denyFinancial(role: string): boolean {
  return !roleAtLeast(role, "ADMIN");
}

function formatDaySummary(s: GestionSnapshot): { text: string; links: GestionLink[] } {
  const links: GestionLink[] = s.preparation.orderIds.map((o) => ({
    label: o.id,
    href: `/admin/orders/${o.id}`,
    kind: "order" as const,
  }));
  for (const p of s.alerts.paymentsToCheck.slice(0, 5)) {
    links.push({ label: p.orderId, href: `/admin/orders/${p.orderId}`, kind: "order" });
  }

  const text = [
    `RÉSUMÉ — ${s.period.label}`,
    ``,
    `Commandes :`,
    `- ${s.orders.received} commande(s) reçue(s)`,
    `- ${s.orders.paid} paiement(s) confirmé(s)`,
    `- ${s.orders.pendingPayment} paiement(s) en attente`,
    `- ${s.orders.cancelled} commande(s) annulée(s)`,
    ``,
    `Chiffre d'affaires :`,
    `- Total confirmé : ${s.revenue.confirmedLabel}`,
    `- Panier moyen : ${s.revenue.averageBasketLabel ?? "n/a (aucune vente confirmée)"}`,
    ``,
    `Préparation :`,
    `- ${s.preparation.toPrepare} à préparer`,
    `- ${s.preparation.preparing} en préparation`,
    `- ${s.preparation.prepared} prête(s)`,
    ``,
    `Livraison :`,
    `- ${s.shipping.shipped} expédiée(s)`,
    `- ${s.shipping.atRelay} en point relais`,
    `- ${s.shipping.delivered} livrée(s)`,
    `- ${s.shipping.anomalies} anomalie(s) / sans MAJ`,
    ``,
    `Alertes :`,
    `- ${s.alerts.paymentsToCheck.length} paiement(s) à vérifier`,
    `- ${s.alerts.stockIssues} alerte(s) stock`,
    `- ${s.documents.invoicesMissing.length} facture(s) manquante(s)`,
    `- ${s.emails.failed} e-mail(s) en erreur`,
    ``,
    `Source : ${s.source}`,
    `Généré le : ${s.generatedAt} (${s.period.timezone})`,
    s.lastSyncAt ? `Dernière sync catalogue/stock : ${s.lastSyncAt}` : `Dernière sync : non disponible`,
  ].join("\n");

  return { text, links };
}

export async function answerAvaGestion(params: {
  message: string;
  role: string;
  periodKey?: DatePeriod;
  timezone?: string;
}): Promise<AvaGestionReply> {
  const settings = await getReportSettings();
  const tz = params.timezone || settings.timezone;
  const msg = params.message.trim();
  const periodKey = params.periodKey || parsePeriodFromText(msg);
  const period = resolvePeriod(periodKey, tz);

  const baseMeta = {
    mode: "gestion" as const,
    periodLabel: period.label,
    source: "postgresql",
    lastSyncAt: null as string | null,
    generatedAt: new Date().toISOString(),
    missingData: [] as string[],
  };

  // Employé : pas de CA / stats financières globales
  const hideFinance = denyFinancial(params.role);

  const lower = msg.toLowerCase();

  // Mémoire client A.V.A. (dossier individuel)
  if (
    /m[eé]moire|dossier client|derni[eè]re (commande|facture)|[eé]tiquette|bon de pr[eé]paration|transporteur (utilis|du client)|go[uû]ts? pr[eé]f[eè]r|recommand/.test(
      lower
    ) ||
    /client\s+[^\s@]+@[^\s]+/.test(lower) ||
    /userId\s*[:=]\s*\w+/.test(lower)
  ) {
    const emailMatch = msg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const idMatch = msg.match(/userId\s*[:=]\s*([a-z0-9]+)/i) || msg.match(/\b(cms[a-z0-9]{20,})\b/i);
    let userId: string | null = idMatch?.[1] || null;
    if (!userId && emailMatch) {
      const u = await prisma.user.findUnique({
        where: { email: emailMatch[1].toLowerCase() },
        select: { id: true },
      });
      userId = u?.id || null;
    }
    if (!userId) {
      const lastPaid = await prisma.order.findFirst({
        where: { userId: { not: null }, status: { not: "PENDING" } },
        orderBy: { createdAt: "desc" },
        select: { userId: true },
      });
      userId = lastPaid?.userId || null;
    }
    if (!userId) {
      return {
        ...baseMeta,
        text: "Aucun client identifiable pour la mémoire A.V.A. Précisez un e-mail ou userId.",
        links: [],
        generatedAt: new Date().toLocaleString("fr-FR", { timeZone: tz }),
      };
    }
    const {
      getClientMemoryDossier,
      refreshClientMemoryFromOrders,
      answerFromClientMemory,
    } = await import("@/lib/ava-memory/service");
    await refreshClientMemoryFromOrders(userId);
    const dossier = await getClientMemoryDossier(userId);
    if (!dossier) {
      return {
        ...baseMeta,
        text: "Mémoire client vide pour cet utilisateur.",
        links: [],
        generatedAt: new Date().toLocaleString("fr-FR", { timeZone: tz }),
      };
    }
    return {
      ...baseMeta,
      text: answerFromClientMemory(dossier, msg),
      links: dossier.orders.slice(0, 5).map((o) => ({
        label: o.id,
        href: `/admin/orders/${o.id}`,
        kind: "order" as const,
      })),
      source: "postgresql:AvaClientMemory,Order,OrderDocument,CarrierShipment,EmailLog",
      generatedAt: new Date().toLocaleString("fr-FR", { timeZone: tz }),
    };
  }

  // Priorités
  if (/qu['']est[- ]ce que j['']ai [àa] faire|priorit[eé]|actions? du jour|todo/.test(lower)) {
    const actions = await buildPriorityActions();
    if (actions.length === 0) {
      return {
        ...baseMeta,
        text: "Aucune action prioritaire détectée à partir des données actuelles.",
        links: [],
        missingData: [],
        lastSyncAt: null,
        generatedAt: new Date().toLocaleString("fr-FR", { timeZone: tz }),
      };
    }
    const links = actions.flatMap((a) => a.links);
    const text = [
      `Tu as ${actions.length} action(s) prioritaire(s) :`,
      ``,
      ...actions.map((a) => `${a.rank}. ${a.text}`),
      ``,
      `Règles appliquées uniquement sur données réelles (aucune priorité inventée).`,
    ].join("\n");
    return { ...baseMeta, text, links, generatedAt: new Date().toLocaleString("fr-FR", { timeZone: tz }) };
  }

  // Comparaisons
  if (/compar|versus|vs\.?|par rapport/.test(lower)) {
    if (hideFinance) {
      return {
        ...baseMeta,
        text: "Comparaison financière réservée au propriétaire / administrateur.",
        links: [],
      };
    }
    let currentKey: DatePeriod = "today";
    let previousKey: DatePeriod = "yesterday";
    if (/semaine/.test(lower)) {
      currentKey = "this_week";
      previousKey = "last_week";
    } else if (/mois/.test(lower)) {
      currentKey = "this_month";
      previousKey = "last_month";
    }
    const cur = await buildGestionSnapshot(resolvePeriod(currentKey, tz));
    const prev = await buildGestionSnapshot(resolvePeriod(previousKey, tz));
    const cmp = compareSnapshots(cur, prev);
    const pct =
      cmp.revenueDeltaPct != null
        ? `${cmp.revenueDeltaPct > 0 ? "+" : ""}${cmp.revenueDeltaPct} %`
        : "n/a (période précédente sans CA)";
    const text = [
      `COMPARAISON`,
      `${cur.period.label} vs ${prev.period.label}`,
      ``,
      `CA confirmé : ${cur.revenue.confirmedLabel} (précédent ${prev.revenue.confirmedLabel})`,
      `Écart : ${formatMoneyEur(cmp.revenueDeltaCents)} (${pct})`,
      `Commandes payées : ${cur.orders.paid} vs ${prev.orders.paid} (Δ ${cmp.ordersDelta > 0 ? "+" : ""}${cmp.ordersDelta})`,
      ``,
      `Éléments factuels :`,
      ...cmp.factualNotes.map((n) => `- ${n}`),
      ``,
      `Aucune cause inventée au-delà des écarts mesurés.`,
    ].join("\n");
    return {
      ...baseMeta,
      text,
      links: [],
      snapshot: cur,
      missingData: cur.missing,
      periodLabel: `${cur.period.label} vs ${prev.period.label}`,
      source: cur.source,
      lastSyncAt: cur.lastSyncAt,
      generatedAt: cur.generatedAt,
    };
  }

  const snapshot = await buildGestionSnapshot(period);

  if (hideFinance && /chiffre|ca\b|panier moyen|revenus?|finance/.test(lower)) {
    return {
      ...baseMeta,
      text: "Les données financières globales sont réservées au propriétaire / administrateur.",
      links: [],
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
      missingData: snapshot.missing,
    };
  }

  if (/stock|rupture/.test(lower)) {
    const lines = [
      `STOCK — ${period.label}`,
      `- Faibles : ${snapshot.stock.low.length}`,
      ...snapshot.stock.low.slice(0, 8).map((p) => `  · ${p.name} (${p.available})`),
      `- Ruptures : ${snapshot.stock.out.length}`,
      ...snapshot.stock.out.slice(0, 8).map((p) => `  · ${p.name}`),
      `- Négatifs : ${snapshot.stock.negative.length}`,
      ...snapshot.stock.negative.slice(0, 5).map((p) => `  · ${p.name} (${p.available})`),
    ];
    return {
      ...baseMeta,
      text: lines.join("\n"),
      links: [...snapshot.stock.low, ...snapshot.stock.out, ...snapshot.stock.negative].slice(0, 15).map((p) => ({
        label: p.name,
        href: `/admin/stocks?q=${encodeURIComponent(p.name)}`,
        kind: "product" as const,
      })),
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  if (/e-?mail|mail/.test(lower)) {
    const text = [
      `E-MAILS — ${period.label}`,
      `- Envoyés : ${snapshot.emails.sent}`,
      `- En attente : ${snapshot.emails.pending}`,
      `- En erreur : ${snapshot.emails.failed}`,
      snapshot.emails.lastErrors.length
        ? `Dernières erreurs :\n${snapshot.emails.lastErrors.map((e) => `- ${e.type} (${e.at}) ${e.error || ""}`).join("\n")}`
        : `Aucune erreur récente listée.`,
    ].join("\n");
    return {
      ...baseMeta,
      text,
      links: [{ label: "Boîte mail", href: "/admin/emails", kind: "alert" }],
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  if (/facture|document|bon de/.test(lower)) {
    const text = [
      `DOCUMENTS — ${period.label}`,
      `- Bons de commande : ${snapshot.documents.orderForms}`,
      `- Bons de préparation : ${snapshot.documents.prepSlips}`,
      `- Bons de livraison : ${snapshot.documents.deliverySlips}`,
      `- Factures : ${snapshot.documents.invoices}`,
      `- Factures manquantes (commandes payées période) : ${snapshot.documents.invoicesMissing.length}`,
      ...snapshot.documents.invoicesMissing.slice(0, 8).map((o) => `  · ${o.orderId}`),
    ].join("\n");
    return {
      ...baseMeta,
      text,
      links: snapshot.documents.invoicesMissing.slice(0, 10).map((o) => ({
        label: o.orderId,
        href: `/admin/orders/${o.orderId}`,
        kind: "invoice" as const,
      })),
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  if (/colis|exp[eé]di|livr|transport|relais/.test(lower)) {
    const text = [
      `EXPÉDITIONS`,
      `- Expédiées (MAJ période) : ${snapshot.shipping.shipped}`,
      `- En relais : ${snapshot.shipping.atRelay}`,
      `- Livrées (période) : ${snapshot.shipping.delivered}`,
      `- Retours : ${snapshot.shipping.returned == null ? "donnée non disponible (sync transporteur absente)" : snapshot.shipping.returned}`,
      `- Sans mouvement > 3 j : ${snapshot.shipping.stale.length}`,
      ...snapshot.shipping.stale.map(
        (c) => `  · ${c.id} (${c.trackingNumber || "sans n°"}) — ${c.days} j`
      ),
    ].join("\n");
    return {
      ...baseMeta,
      text,
      links: snapshot.shipping.stale.map((c) => ({
        label: c.id,
        href: `/admin/orders/${c.id}`,
        kind: "shipment" as const,
      })),
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  if (/pr[eé]par/.test(lower)) {
    const text = [
      `PRÉPARATION`,
      `- À préparer (PAID) : ${snapshot.preparation.toPrepare}`,
      ...snapshot.preparation.orderIds.map((o) => `  · ${o.id}`),
      `- En préparation : ${snapshot.preparation.preparing}`,
      `- Prêtes : ${snapshot.preparation.prepared}`,
    ].join("\n");
    return {
      ...baseMeta,
      text,
      links: snapshot.preparation.orderIds.map((o) => ({
        label: o.id,
        href: `/admin/orders/${o.id}`,
        kind: "order" as const,
      })),
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  if (/meilleur|plus vendu|top vente|ventes/.test(lower)) {
    const text = [
      `VENTES — ${period.label}`,
      `Produits :`,
      ...snapshot.sales.topProducts.slice(0, 8).map(
        (p) => `- ${p.name} ×${p.qty} (${formatMoneyEur(p.revenueCents)})`
      ),
      `Catégories :`,
      ...snapshot.sales.topCategories.slice(0, 5).map((c) => `- ${c.name} ×${c.qty}`),
      `Promotions utilisées : ${snapshot.sales.promotionsUsed}`,
      `Produits offerts (prix 0) : ${snapshot.sales.gifts}`,
    ].join("\n");
    return {
      ...baseMeta,
      text,
      links: snapshot.sales.topProducts.slice(0, 8).map((p) => ({
        label: p.name,
        href: `/admin/products?q=${encodeURIComponent(p.name)}`,
        kind: "product" as const,
      })),
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  // Défaut : résumé structuré (jamais de conseil produit)
  const summary = formatDaySummary(snapshot);
  if (hideFinance) {
    const text = summary.text
      .split("\n")
      .filter((l) => !/chiffre|panier moyen|Total confirmé/i.test(l))
      .join("\n");
    return {
      ...baseMeta,
      text: text + "\n\n(Montants financiers masqués pour le rôle employé.)",
      links: summary.links,
      snapshot,
      missingData: snapshot.missing,
      periodLabel: period.label,
      source: snapshot.source,
      lastSyncAt: snapshot.lastSyncAt,
      generatedAt: snapshot.generatedAt,
    };
  }

  return {
    ...baseMeta,
    text: summary.text,
    links: summary.links,
    snapshot,
    missingData: snapshot.missing,
    periodLabel: period.label,
    source: snapshot.source,
    lastSyncAt: snapshot.lastSyncAt,
    generatedAt: snapshot.generatedAt,
  };
}
