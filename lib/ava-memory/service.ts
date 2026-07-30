/**
 * Mémoire client A.V.A. — archive documents, e-mails, expéditions, préférences.
 * Aucune suppression automatique.
 */
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { maskEmail } from "@/lib/email/mask";

export type MemoryArtifactKind =
  | "order_form"
  | "invoice"
  | "prep_slip"
  | "delivery_slip"
  | "carrier_label"
  | "tracking"
  | "email_sent"
  | "payment"
  | "preference"
  | "note";

export async function ensureClientMemory(userId: string, email?: string | null) {
  return prisma.avaClientMemory.upsert({
    where: { userId },
    create: {
      userId,
      emailMasked: email ? maskEmail(email) : null,
    },
    update: email ? { emailMasked: maskEmail(email) } : {},
  });
}

export async function archiveMemoryArtifact(input: {
  userId?: string | null;
  orderId?: string | null;
  kind: MemoryArtifactKind;
  idempotencyKey: string;
  title: string;
  metaJson?: Record<string, unknown> | null;
  documentId?: string | null;
  emailLogId?: string | null;
  shipmentId?: string | null;
}) {
  const existing = await prisma.avaMemoryArtifact.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { artifact: existing, created: false };

  let memoryId: string | null = null;
  if (input.userId) {
    const mem = await ensureClientMemory(input.userId);
    memoryId = mem.id;
  }

  const artifact = await prisma.avaMemoryArtifact.create({
    data: {
      memoryId,
      userId: input.userId || null,
      orderId: input.orderId || null,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      title: input.title,
      metaJson: (input.metaJson as Prisma.InputJsonValue | undefined) || undefined,
      documentId: input.documentId || null,
      emailLogId: input.emailLogId || null,
      shipmentId: input.shipmentId || null,
    },
  });
  return { artifact, created: true };
}

/** Reconstruit les préférences dérivées à partir des commandes payées. */
export async function refreshClientMemoryFromOrders(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      vapeProfile: true,
      orders: {
        where: {
          status: {
            in: ["PAID", "PREPARING", "PREPARED", "SHIPPED", "AT_RELAY", "DELIVERED"],
          },
          isAudit: false,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  range: true,
                  category: true,
                  avaMeta: { select: { avaSaveurs: true } },
                  flavors: {
                    select: { primaryFlavor: true, secondaryFlavor: true, flavorFamily: true },
                    take: 3,
                  },
                },
              },
              variant: { select: { nicotineMg: true, nicotineLabel: true } },
            },
          },
          documents: { select: { type: true, invoiceNumber: true } },
          carrierShipments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!user) return null;

  const brandCount = new Map<string, number>();
  const rangeCount = new Map<string, number>();
  const flavorCount = new Map<string, number>();
  const nicotine: number[] = [];
  const productIds: string[] = [];
  const dates: number[] = [];

  for (const o of user.orders) {
    dates.push(o.createdAt.getTime());
    for (const item of o.items) {
      productIds.push(item.productId);
      if (item.product.brand) {
        brandCount.set(item.product.brand, (brandCount.get(item.product.brand) || 0) + item.quantity);
      }
      if (item.product.range) {
        rangeCount.set(item.product.range, (rangeCount.get(item.product.range) || 0) + item.quantity);
      }
      const flavorHints = [
        item.product.avaMeta?.avaSaveurs,
        ...(item.product.flavors || []).flatMap((f: {
          primaryFlavor: string | null;
          secondaryFlavor: string | null;
          flavorFamily: string | null;
        }) => [f.primaryFlavor, f.secondaryFlavor, f.flavorFamily]),
      ].filter(Boolean) as string[];
      for (const fl of flavorHints) {
        for (const part of fl.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean)) {
          flavorCount.set(part, (flavorCount.get(part) || 0) + item.quantity);
        }
      }
      if (item.variant?.nicotineMg != null) nicotine.push(item.variant.nicotineMg);
    }
  }

  const top = (m: Map<string, number>, n = 5) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);

  let purchaseFrequencyDays: number | null = null;
  if (dates.length >= 2) {
    const sorted = [...dates].sort((a, b) => b - a);
    const gaps: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      gaps.push((sorted[i] - sorted[i + 1]) / (1000 * 60 * 60 * 24));
    }
    purchaseFrequencyDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  const last = user.orders[0] || null;
  const lastInvoice =
    last?.documents.find((d) => d.type === "INVOICE")?.invoiceNumber ||
    last?.invoiceNumber ||
    null;
  const lastShip = last?.carrierShipments[0];
  const usualNicotine =
    nicotine.length > 0
      ? Math.round(nicotine.reduce((a, b) => a + b, 0) / nicotine.length)
      : user.vapeProfile?.usedNicotineMg ?? user.vapeProfile?.advisedNicotineMg ?? null;

  const preferredFlavors = [
    ...new Set([
      ...top(flavorCount),
      ...(user.vapeProfile?.preferredFlavors || []),
    ]),
  ].slice(0, 8);

  const summary = {
    account: {
      emailMasked: maskEmail(user.email),
      firstName: user.firstName,
      lastName: user.lastName,
      phoneMasked: user.phone ? `${user.phone.slice(0, 2)}***` : null,
    },
    ordersCount: user.orders.length,
    lastOrderId: last?.id || null,
    lastDeliveryMethod: last?.deliveryMethod || null,
    lastCarrier: lastShip?.carrier || last?.deliveryMethod || null,
    lastTrackingNumber: lastShip?.trackingNumber || last?.trackingNumber || null,
    preferredBrands: top(brandCount),
    preferredRanges: top(rangeCount),
    preferredFlavors,
    usualNicotineMg: usualNicotine,
    purchaseFrequencyDays,
    recommendedProductIds: user.vapeProfile?.advisedProductIds || [],
    refreshedAt: new Date().toISOString(),
  };

  const memory = await prisma.avaClientMemory.upsert({
    where: { userId },
    create: {
      userId,
      emailMasked: maskEmail(user.email),
      preferredBrands: summary.preferredBrands,
      preferredRanges: summary.preferredRanges,
      preferredFlavors,
      usualNicotineMg: usualNicotine,
      purchaseFrequencyDays,
      lastOrderId: last?.id || null,
      lastInvoiceNumber: lastInvoice,
      lastCarrier: summary.lastCarrier,
      lastTrackingNumber: summary.lastTrackingNumber,
      recommendedProductIds: summary.recommendedProductIds,
      summaryJson: summary,
    },
    update: {
      emailMasked: maskEmail(user.email),
      preferredBrands: summary.preferredBrands,
      preferredRanges: summary.preferredRanges,
      preferredFlavors,
      usualNicotineMg: usualNicotine,
      purchaseFrequencyDays,
      lastOrderId: last?.id || null,
      lastInvoiceNumber: lastInvoice,
      lastCarrier: summary.lastCarrier,
      lastTrackingNumber: summary.lastTrackingNumber,
      recommendedProductIds: summary.recommendedProductIds,
      summaryJson: summary,
    },
  });

  return memory;
}

export async function getClientMemoryDossier(userId: string) {
  const memory = await prisma.avaClientMemory.findUnique({
    where: { userId },
    include: {
      artifacts: { orderBy: { createdAt: "desc" }, take: 40 },
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });
  if (!memory) return null;

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      documents: true,
      carrierShipments: true,
      items: {
        include: {
          product: { select: { name: true, brand: true } },
          variant: { select: { nicotineLabel: true, nicotineMg: true } },
        },
      },
    },
  });

  const emails = await prisma.emailLog.findMany({
    where: { relatedCustomerId: userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return {
    memory: {
      ...memory,
      user: memory.user
        ? {
            id: memory.user.id,
            emailMasked: maskEmail(memory.user.email),
            firstName: memory.user.firstName,
            lastName: memory.user.lastName,
            phoneMasked: memory.user.phone
              ? `${memory.user.phone.slice(0, 2)}***`
              : null,
          }
        : null,
    },
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalCents: o.totalCents,
      deliveryMethod: o.deliveryMethod,
      trackingNumber: o.trackingNumber,
      invoiceNumber: o.invoiceNumber,
      isAudit: o.isAudit,
      createdAt: o.createdAt,
      documents: o.documents.map((d) => ({
        id: d.id,
        type: d.type,
        invoiceNumber: d.invoiceNumber,
        emailedToCustomer: d.emailedToCustomer,
        emailedInternal: d.emailedInternal,
        emailedToAva: d.emailedToAva,
      })),
      shipments: o.carrierShipments,
      items: o.items.map((i) => ({
        name: i.product.name,
        brand: i.product.brand,
        qty: i.quantity,
        nicotine: i.variant?.nicotineLabel || i.variant?.nicotineMg,
      })),
    })),
    emails: emails.map((e) => ({
      id: e.id,
      type: e.type,
      subject: e.subject,
      status: e.status,
      transport: e.transport,
      recipientMasked: e.recipientMasked,
      relatedOrderId: e.relatedOrderId,
      sentAt: e.sentAt,
    })),
  };
}

/** Réponses A.V.A. Gestion sur un dossier client (données réelles uniquement). */
export function answerFromClientMemory(
  dossier: NonNullable<Awaited<ReturnType<typeof getClientMemoryDossier>>>,
  question: string
): string {
  const q = question.toLowerCase();
  const last = dossier.orders[0];
  const mem = dossier.memory;

  if (/renvoie[- ]?moi l['']?[eé]tiquette|envoie[- ]?moi l['']?[eé]tiquette|[eé]tiquette|label/.test(q)) {
    const ship = last?.shipments?.[0];
    if (!ship) return "Aucune expédition / étiquette en mémoire pour la dernière commande.";
    if (!ship.labelStoragePath) {
      return `Expédition ${ship.carrier} en mode ${ship.mode} — statut ${ship.status}. Étiquette PDF absente (à importer en mode assisté si API non branchée). Suivi : ${ship.trackingNumber || "en attente"}.`;
    }
    return `Étiquette archivée : ${ship.labelFileName || ship.labelStoragePath} — transporteur ${ship.carrier} — suivi ${ship.trackingNumber || "n/a"} — QR officiel : ${ship.qrAvailable ? "oui" : "non fourni (non inventé)"}. Téléchargement admin via stockage expédition / commande ${last?.id.slice(-8).toUpperCase()}.`;
  }

  if (/renvoie[- ]?moi la facture|envoie[- ]?moi la facture|derni[eè]re facture|facture/.test(q)) {
    const invDoc = last?.documents.find((d) => d.type === "INVOICE");
    const inv =
      mem.lastInvoiceNumber || invDoc?.invoiceNumber || last?.invoiceNumber;
    if (!inv && !invDoc) return "Aucune facture trouvée pour ce client.";
    return [
      `Facture : ${inv || invDoc?.id}`,
      `Document id : ${invDoc?.id || "n/a"}`,
      `E-mail client (journal) : ${invDoc?.emailedToCustomer === true ? "envoyé" : invDoc?.emailedToCustomer === false ? "non confirmé" : "n/a"}`,
      `E-mail gérant : ${invDoc?.emailedInternal === true ? "oui" : "non"}`,
      `Archivé A.V.A. : ${invDoc?.emailedToAva === true ? "oui" : "mémoire document présente"}`,
    ].join(" — ");
  }

  if (/o[uù] est le colis|suivi|tracking|livraison|statut.*colis/.test(q)) {
    const ship = last?.shipments?.[0];
    return [
      `Dernière commande ${last?.id.slice(-8).toUpperCase() || "n/a"} — statut commande ${last?.status || "n/a"}`,
      `Transporteur : ${ship?.carrier || last?.deliveryMethod || "n/a"}`,
      `Suivi : ${ship?.trackingNumber || last?.trackingNumber || "aucun"}`,
      `Statut expédition : ${ship?.status || "n/a"}`,
      `Mode : ${ship?.mode || "n/a"}`,
    ].join(" — ");
  }

  if (/ai[- ]?je envoy[eé].*pr[eé]paration|bon de pr[eé]paration|pr[eé]paration|prep/.test(q)) {
    const prep = last?.documents.find((d) => d.type === "PREP_SLIP");
    if (!prep) return "Bon de préparation non trouvé pour la dernière commande.";
    return `Bon de préparation ${prep.id} — envoyé gérant : ${prep.emailedInternal ? "oui (journal)" : "non"} — jamais envoyé au client (emailedToCustomer=${prep.emailedToCustomer}).`;
  }

  if (/re[cç]u.*facture|facture.*re[cç]u|client a[- ]?t[- ]?il re[cç]u/.test(q)) {
    const inv = last?.documents.find((d) => d.type === "INVOICE");
    const mail = dossier.emails.find(
      (e) => e.relatedOrderId === last?.id && /facture/i.test(e.subject) && e.status === "SENT"
    );
    return `Document facture emailedToCustomer=${inv?.emailedToCustomer ?? "n/a"}. Journal e-mail SENT trouvé : ${mail ? "oui (" + mail.id + ")" : "non"}. Réception boîte Gmail : non affirmée ici (preuve inbox séparée requise).`;
  }

  if (/derni[eè]re commande|retrouve.*commande|last order/.test(q)) {
    if (!last) return "Aucune commande enregistrée pour ce client.";
    return `Dernière commande : ${last.id.slice(-8).toUpperCase()} — statut ${last.status} — ${(last.totalCents / 100).toFixed(2)} € — livraison ${last.deliveryMethod || "n/a"} — le ${last.createdAt.toLocaleString("fr-FR")}.`;
  }

  if (/transporteur|mondial|relais|carrier/.test(q)) {
    return `Transporteur habituel / dernier : ${mem.lastCarrier || last?.deliveryMethod || "inconnu"}. Suivi : ${mem.lastTrackingNumber || last?.trackingNumber || "aucun"}.`;
  }
  if (/go[uû]t|saveur|flavor|pr[eé]f[eè]re/.test(q)) {
    const flavors = mem.preferredFlavors || [];
    const brands = mem.preferredBrands || [];
    return `Goûts préférés : ${flavors.length ? flavors.join(", ") : "non déterminés"}. Marques : ${brands.length ? brands.join(", ") : "non déterminées"}. Nicotine habituelle : ${mem.usualNicotineMg != null ? `${mem.usualNicotineMg} mg` : "n/a"}.`;
  }
  if (/recommand/.test(q)) {
    const ids = mem.recommendedProductIds || [];
    return ids.length
      ? `Produits recommandés (ids) : ${ids.slice(0, 5).join(", ")}.`
      : "Aucune recommandation stockée — profil vape ou historique insuffisant.";
  }

  return [
    `Dossier A.V.A. — ${mem.emailMasked || "client"}`,
    `- Commandes en mémoire : ${dossier.orders.length}`,
    `- Dernière commande : ${mem.lastOrderId?.slice(-8).toUpperCase() || "aucune"}`,
    `- Dernière facture : ${mem.lastInvoiceNumber || "aucune"}`,
    `- Transporteur : ${mem.lastCarrier || "n/a"}`,
    `- Goûts : ${(mem.preferredFlavors || []).join(", ") || "n/a"}`,
    `- Artefacts archivés : ${mem.artifacts?.length ?? 0}`,
  ].join("\n");
}
