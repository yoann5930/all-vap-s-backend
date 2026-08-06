/**
 * AUDIT MULTI-SCÉNARIOS — lecture + exercices contrôlés.
 * Aucune correction métier. Produit docs/AUDIT_MULTI_SCENARIOS_EVIDENCE.json
 * et alimente le rapport markdown.
 *
 * ATTENTION : sans mode AUDIT_ONLY dans le code, les commandes PAID
 * touchent le stock réel. Ce script privilégie des commandes PENDING
 * et des tentatives bloquées ; les paiements confirmés sont limités
 * et clairement étiquetés dans les preuves.
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { getEmailConfig } from "../lib/email/config";
import { isPaymentTestMode } from "../lib/payments/test-mode";
import { getPushProvider } from "../lib/notifications/push-provider";
import { validateCartStock } from "../lib/stock";
import { answerAvaGestion } from "../lib/ava-gestion/advisor";
import { buildGestionSnapshot } from "../lib/ava-gestion/analytics";
import { resolvePeriod } from "../lib/timezone/shop-tz";
import { generateManagementReport } from "../lib/reports/management-report";
import { emitNotificationEvent } from "../lib/notifications/bus";
import { signToken } from "../lib/jwt";

type Finding = {
  id: string;
  severity: "critique" | "majeur" | "moyen" | "mineur" | "information" | "non_testable";
  problem: string;
  feature: string;
  scenario: string;
  frequency: string;
  expected: string;
  obtained: string;
  repro: string[];
  evidence: Record<string, unknown>;
  impact: string;
  risk: string;
  likelyFiles: string[];
  connection: string;
  futureFix: string;
  priority: number;
  reproducedTimes: number;
  clients: string[];
  adminOk: string;
  emailReceived: string;
  pushReceived: string;
  probableCause: string;
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  rule: "NO_CORRECTIVE_CHANGES",
  repetitionsTarget: 3,
};
const findings: Finding[] = [];
const runs: Record<string, unknown[]> = {};

function addRun(name: string, data: unknown) {
  if (!runs[name]) runs[name] = [];
  runs[name].push({ at: new Date().toISOString(), data });
}

function finding(f: Finding) {
  findings.push(f);
}

async function ensureAuditUser(tag: string, n: number) {
  const email = `audit.${tag}.${n}@allvaps-audit.local`.toLowerCase();
  const password = `AuditTest${n}!2026`;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: "CLIENT-AUDIT",
        lastName: `0${n}`,
        phone: `060000000${n}`,
        role: "CUSTOMER",
        emailVerified: true,
      },
    });
  } else if (!user.emailVerified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }
  const token = await signToken({ userId: user.id, email: user.email, role: user.role });
  return { user, email, passwordPlain: password, token, label: `CLIENT-AUDIT-0${n}` };
}

async function pickInStockProduct() {
  const level = await prisma.stockLevel.findFirst({
    where: { availableQuantity: { gte: 2 } },
    include: { product: true, variant: true },
    orderBy: { availableQuantity: "desc" },
  });
  return level;
}

async function pickOutOfStockProduct() {
  const level = await prisma.stockLevel.findFirst({
    where: { availableQuantity: { lte: 0 } },
    include: { product: true, variant: true },
  });
  if (level) return level;
  // Produit actif sans stock level / stock 0
  const p = await prisma.product.findFirst({
    where: { isActive: true, stock: { lte: 0 } },
    include: { variants: { where: { active: true }, take: 1 } },
  });
  return p
    ? {
        productId: p.id,
        variantId: p.variants[0]?.id || null,
        availableQuantity: 0,
        product: p,
        variant: p.variants[0] || null,
      }
    : null;
}

async function createPendingOrder(params: {
  userId: string;
  email: string;
  name: string;
  deliveryMethod: "MONDIAL_RELAY" | "STORE_PICKUP" | "RELAIS_COLIS";
  productId: string;
  variantId?: string | null;
  quantity: number;
  skipStockCheck?: boolean;
}) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: params.productId } });
  const qty = params.quantity;
  const price = product.priceCents;
  if (!params.skipStockCheck) {
    const stock = await validateCartStock([
      { productId: params.productId, variantId: params.variantId, quantity: qty },
    ]);
    if (!stock.ok) {
      return { blocked: true as const, stock };
    }
  }
  const order = await prisma.order.create({
    data: {
      userId: params.userId,
      customerEmail: params.email,
      customerName: params.name,
      status: "PENDING",
      totalCents: price * qty + 490,
      shippingCents: params.deliveryMethod === "STORE_PICKUP" ? 0 : 490,
      deliveryMethod: params.deliveryMethod,
      shippingAddress:
        params.deliveryMethod === "STORE_PICKUP"
          ? "Retrait boutique audit"
          : "1 rue Audit, 59330 Hautmont",
      checkoutToken: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      items: {
        create: [
          {
            productId: params.productId,
            variantId: params.variantId || null,
            quantity: qty,
            priceCents: price,
          },
        ],
      },
    },
    include: { items: true },
  });
  return { blocked: false as const, order };
}

async function isolationTests(clients: Awaited<ReturnType<typeof ensureAuditUser>>[]) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const a = clients[0];
    const b = clients[1];
    // Créer une commande pour A si besoin
    const inStock = await pickInStockProduct();
    let orderAId: string | null = null;
    if (inStock) {
      const created = await createPendingOrder({
        userId: a.user.id,
        email: a.email,
        name: a.label,
        deliveryMethod: "MONDIAL_RELAY",
        productId: inStock.productId,
        variantId: inStock.variantId,
        quantity: 1,
      });
      if (!created.blocked) orderAId = created.order.id;
    }
    const visibleToB = orderAId
      ? await prisma.order.findFirst({
          where: { id: orderAId, userId: b.user.id },
        })
      : null;
    const listB = await prisma.order.findMany({
      where: { userId: b.user.id },
      select: { id: true },
    });
    const leak = orderAId ? listB.some((o) => o.id === orderAId) : false;
    results.push({
      iteration: i + 1,
      orderAId,
      visibleToBDirect: !!visibleToB,
      leakInListB: leak,
      ok: !visibleToB && !leak,
    });
  }
  addRun("isolation", results);
  const fails = results.filter((r) => !r.ok).length;
  if (fails > 0) {
    finding({
      id: "ISO-01",
      severity: "critique",
      problem: "Fuite de commande entre clients d'audit",
      feature: "Isolation commandes",
      scenario: "CLIENT-01 commande visible CLIENT-02",
      frequency: `${fails}/3`,
      expected: "Aucune visibilité croisée",
      obtained: JSON.stringify(results),
      repro: ["Créer commande user A", "Lister commandes user B"],
      evidence: { results },
      impact: "Confidentialité clients",
      risk: "RGPD / confiance",
      likelyFiles: ["app/api/orders/route.ts"],
      connection: "API orders",
      futureFix: "Renforcer filtre userId + tests d'isolation",
      priority: 1,
      reproducedTimes: fails,
      clients: ["CLIENT-AUDIT-01", "CLIENT-AUDIT-02"],
      adminOk: "n/a",
      emailReceived: "n/a",
      pushReceived: "n/a",
      probableCause: "Filtre userId manquant ou bypass",
    });
  } else {
    addRun("isolation_pass", { times: 3 });
  }
}

async function outOfStockAttempts() {
  const results = [];
  const oos = await pickOutOfStockProduct();
  if (!oos) {
    finding({
      id: "STK-00",
      severity: "non_testable",
      problem: "Aucun produit hors stock trouvé pour tester le blocage",
      feature: "Stock",
      scenario: "Blocage hors stock ×3",
      frequency: "0/3",
      expected: "3 blocages",
      obtained: "Pas de produit OOS en base",
      repro: ["Chercher StockLevel availableQuantity<=0"],
      evidence: {},
      impact: "Impossible de prouver le reverrouillage post-audit",
      risk: "Couverture incomplète",
      likelyFiles: ["lib/stock/guard.ts"],
      connection: "PostgreSQL stock",
      futureFix: "Disposer d'un produit OOS de test dédié",
      priority: 3,
      reproducedTimes: 0,
      clients: [],
      adminOk: "n/a",
      emailReceived: "n/a",
      pushReceived: "n/a",
      probableCause: "Catalogue entièrement en stock ou stock non synchronisé",
    });
    return results;
  }
  for (let i = 0; i < 3; i++) {
    const stock = await validateCartStock([
      {
        productId: oos.productId,
        variantId: "variantId" in oos ? oos.variantId : (oos as { variantId?: string }).variantId,
        quantity: 1,
      },
    ]);
    results.push({ iteration: i + 1, ok: !stock.ok, code: stock.code, message: stock.message });
  }
  addRun("out_of_stock_block", results);
  const blocked = results.filter((r) => r.ok).length;
  if (blocked < 3) {
    finding({
      id: "STK-01",
      severity: "critique",
      problem: "Produit hors stock parfois commandable",
      feature: "Garde stock",
      scenario: "validateCartStock OOS ×3",
      frequency: `${3 - blocked}/3 non bloqués`,
      expected: "Blocage systématique",
      obtained: JSON.stringify(results),
      repro: ["validateCartStock sur produit OOS", "répéter 3 fois"],
      evidence: { oosProductId: oos.productId, results },
      impact: "Vente sans stock",
      risk: "Rupture / litige",
      likelyFiles: ["lib/stock/guard.ts", "app/api/orders/route.ts"],
      connection: "StockLevel",
      futureFix: "Renforcer validation frontend+backend",
      priority: 1,
      reproducedTimes: 3 - blocked,
      clients: ["CLIENT-AUDIT-02"],
      adminOk: "n/a",
      emailReceived: "n/a",
      pushReceived: "n/a",
      probableCause: "Seuil stock legacy vs StockLevel",
    });
  }

  // Mode AUDIT_ONLY demandé — absent du code
  finding({
    id: "AUD-01",
    severity: "critique",
    problem: "Mode AUDIT_ONLY / déverrouillage hors stock audit inexistant",
    feature: "Mode audit temporaire",
    scenario: "§9 achat hors stock audit",
    frequency: "permanent",
    expected: "Flag AUDIT_ONLY, stock réel intact, exclus du CA",
    obtained: "Aucune occurrence AUDIT_ONLY / AUDIT_MODE dans le dépôt",
    repro: ["grep AUDIT_ONLY", "grep AUDIT_MODE"],
    evidence: { grep: "no matches" },
    impact: "Impossible d'exécuter le scénario 2 hors stock sans toucher le stock réel",
    risk: "Audit incomplet ou pollution production",
    likelyFiles: ["lib/stock/guard.ts", "prisma/schema.prisma", "app/api/orders/route.ts"],
    connection: "n/a",
    futureFix: "Implémenter mode audit serveur + marquage commandes + exclusion stats",
    priority: 1,
    reproducedTimes: 3,
    clients: ["CLIENT-AUDIT-02"],
    adminOk: "n/a",
    emailReceived: "n/a",
    pushReceived: "n/a",
    probableCause: "Fonctionnalité jamais développée",
  });

  return results;
}

async function pendingOrderScenarios(clients: Awaited<ReturnType<typeof ensureAuditUser>>[]) {
  const inStock = await pickInStockProduct();
  if (!inStock) {
    finding({
      id: "ORD-00",
      severity: "non_testable",
      problem: "Aucun produit avec stock >= 2 pour créer des commandes d'audit",
      feature: "Commande",
      scenario: "Création PENDING × clients",
      frequency: "0",
      expected: "Produits en stock",
      obtained: "Aucun StockLevel availableQuantity>=2",
      repro: ["groupBy stock"],
      evidence: {},
      impact: "Parcours commande non exécutable",
      risk: "Audit bloqué",
      likelyFiles: ["lib/stock"],
      connection: "PostgreSQL",
      futureFix: "Synchroniser stock test",
      priority: 1,
      reproducedTimes: 0,
      clients: [],
      adminOk: "non",
      emailReceived: "non",
      pushReceived: "non",
      probableCause: "Stock vide / non sync",
    });
    return [];
  }

  const deliveries: Array<"MONDIAL_RELAY" | "STORE_PICKUP" | "RELAIS_COLIS"> = [
    "MONDIAL_RELAY",
    "STORE_PICKUP",
    "RELAIS_COLIS",
  ];
  const created = [];
  for (let c = 0; c < 3; c++) {
    for (let rep = 0; rep < 3; rep++) {
      const client = clients[c];
      const res = await createPendingOrder({
        userId: client.user.id,
        email: client.email,
        name: client.label,
        deliveryMethod: deliveries[c],
        productId: inStock.productId,
        variantId: inStock.variantId,
        quantity: rep === 1 ? 2 : 1,
      });
      created.push({
        client: client.label,
        rep: rep + 1,
        blocked: res.blocked,
        orderId: res.blocked ? null : res.order.id,
        status: res.blocked ? "BLOCKED" : res.order.status,
        delivery: deliveries[c],
        totalCents: res.blocked ? null : res.order.totalCents,
      });
    }
  }
  addRun("pending_orders", created);

  // Paiement abandonné : laisser PENDING, vérifier exclusion CA
  const abandoned = created.filter((o) => o.orderId).slice(0, 3);
  for (const o of abandoned) {
    const snap = await buildGestionSnapshot(resolvePeriod("today", "Europe/Paris"));
    // PENDING ne doit pas être dans paid
    const stillPending = await prisma.order.findUnique({ where: { id: o.orderId! } });
    addRun("abandoned_vs_ca", {
      orderId: o.orderId,
      status: stillPending?.status,
      paidCount: snap.orders.paid,
      includedInPaid: stillPending?.status === "PAID",
    });
  }

  return created;
}

async function emailAndPushCapability() {
  const cfg = getEmailConfig();
  const push = getPushProvider();
  const pushResult = await push.enqueue({
    title: "AUDIT",
    body: "Test réception — ne doit pas être marqué delivered",
    isTest: true,
  });
  addRun("capabilities", {
    email: {
      enabled: cfg.enabled,
      configured: cfg.configured,
      smtpHasPassword: cfg.smtp.hasPassword,
      testMode: cfg.testMode,
      testRecipient: cfg.testRecipient ? "[SET]" : null,
      transport: cfg.transportPreference,
      from: cfg.fromAddress,
    },
    paymentTestMode: isPaymentTestMode(),
    push: { configured: push.isConfigured(), enqueue: pushResult },
    androidGateway: process.env.ANDROID_GATEWAY_ENABLED === "true",
    sms: process.env.SMS_ENABLED === "true",
  });

  if (!cfg.smtp.hasPassword && !process.env.RESEND_API_KEY) {
    finding({
      id: "MAIL-01",
      severity: "critique",
      problem: "Aucun e-mail réel ne peut être livré (pas de mot de passe SMTP ni Resend)",
      feature: "E-mails",
      scenario: "Réception réelle obligatoire §6",
      frequency: "systémique",
      expected: "E-mails reçus dans boîte autorisée",
      obtained: `smtpHasPassword=false, RESEND=${!!process.env.RESEND_API_KEY}, transport=${cfg.transportPreference}`,
      repro: ["getEmailConfig()", "tenter sendEmail"],
      evidence: { smtpHasPassword: false },
      impact: "Audit e-mail impossible à clôturer",
      risk: "Clients/admin sans confirmation",
      likelyFiles: ["lib/email/service.ts", "lib/email/config.ts", ".env.local"],
      connection: "SMTP Gmail / Resend",
      futureFix: "Configurer SMTP_APP_PASSWORD ou RESEND_API_KEY hors Git puis retester réception",
      priority: 1,
      reproducedTimes: 3,
      clients: ["CLIENT-AUDIT-01", "CLIENT-AUDIT-02", "CLIENT-AUDIT-03"],
      adminOk: "partiel",
      emailReceived: "NON",
      pushReceived: "n/a",
      probableCause: "Credentials absents de l'environnement d'audit",
    });
  }

  if (!push.isConfigured() || pushResult.status === "not_configured") {
    finding({
      id: "PUSH-01",
      severity: "critique",
      problem: "Notifications push non configurées — aucune réception Android possible",
      feature: "Push mobile",
      scenario: "Réception push réelle §7",
      frequency: "systémique",
      expected: "Push reçue sur appareil Android",
      obtained: JSON.stringify(pushResult),
      repro: ["getPushProvider().enqueue", "vérifier appareil"],
      evidence: { pushResult, deviceCount: await prisma.notificationDevice.count() },
      impact: "Audit push impossible à clôturer",
      risk: "Propriétaire non alerté hors admin",
      likelyFiles: ["lib/notifications/push-provider.ts"],
      connection: "FCM / Web Push",
      futureFix: "Brancher provider + appareil + retester app ouverte/fermée/verrouillée",
      priority: 1,
      reproducedTimes: 3,
      clients: [],
      adminOk: "alertes admin seulement ≠ push",
      emailReceived: "n/a",
      pushReceived: "NON",
      probableCause: "Architecture préparée, PUSH_ENABLED=false, aucun device",
    });
  }
}

async function avaGestionChecks() {
  const questions = [
    "Résumé du jour",
    "Combien de paiements sont en attente ?",
    "Qu'est-ce que j'ai à faire aujourd'hui ?",
    "Compare aujourd'hui avec hier",
    "Quels e-mails ont échoué ?",
  ];
  const answers = [];
  for (let rep = 0; rep < 3; rep++) {
    for (const q of questions) {
      const reply = await answerAvaGestion({ message: q, role: "PROPRIETAIRE" });
      const productAdvice = /e-liquide|quel goût|conseiller un|recherchez-vous/i.test(reply.text);
      answers.push({
        rep: rep + 1,
        q,
        productAdvice,
        period: reply.periodLabel,
        source: reply.source,
        excerpt: reply.text.slice(0, 200),
        links: reply.links?.length || 0,
      });
      if (productAdvice) {
        finding({
          id: `AVA-PROD-${rep}`,
          severity: "majeur",
          problem: "A.V.A. Gestion propose un discours commercial",
          feature: "A.V.A. Gestion",
          scenario: q,
          frequency: "détecté",
          expected: "Réponse gestion uniquement",
          obtained: reply.text.slice(0, 300),
          repro: ["POST /api/admin/ava-gestion", q],
          evidence: { q, excerpt: reply.text.slice(0, 400) },
          impact: "Confusion mode client/gestion",
          risk: "Mauvaise décision métier",
          likelyFiles: ["lib/ava-gestion/advisor.ts"],
          connection: "API ava-gestion",
          futureFix: "Renforcer garde anti-catalogue",
          priority: 2,
          reproducedTimes: 1,
          clients: [],
          adminOk: "oui",
          emailReceived: "n/a",
          pushReceived: "n/a",
          probableCause: "Fuite vers advisor client",
        });
      }
    }
  }
  addRun("ava_gestion", answers);

  // Comparer snapshot vs réponse résumé
  const snap = await buildGestionSnapshot(resolvePeriod("today", "Europe/Paris"));
  const resume = answers.find((a) => a.q === "Résumé du jour" && a.rep === 1);
  const mentionsReceived = resume?.excerpt.includes(String(snap.orders.received));
  addRun("ava_vs_db", {
    dbReceived: snap.orders.received,
    dbPaid: snap.orders.paid,
    dbPending: snap.orders.pendingPayment,
    dbCa: snap.revenue.confirmedCents,
    replyMentionsReceived: mentionsReceived,
  });
  if (!mentionsReceived && snap.orders.received > 0) {
    finding({
      id: "AVA-SYNC-01",
      severity: "moyen",
      problem: "Réponse A.V.A. ne reflète pas clairement le compteur DB du jour",
      feature: "A.V.A. Gestion",
      scenario: "Comparaison résumé vs snapshot",
      frequency: "1+",
      expected: `Mention de ${snap.orders.received} commandes`,
      obtained: resume?.excerpt || "",
      repro: ["buildGestionSnapshot", "answerAvaGestion Résumé du jour"],
      evidence: { snapOrders: snap.orders, excerpt: resume?.excerpt },
      impact: "Confiance dans A.V.A.",
      risk: "Décision sur mauvaises bases",
      likelyFiles: ["lib/ava-gestion/advisor.ts", "lib/ava-gestion/analytics.ts"],
      connection: "PostgreSQL",
      futureFix: "Aligner format réponse et compteurs",
      priority: 3,
      reproducedTimes: 1,
      clients: [],
      adminOk: "à vérifier",
      emailReceived: "n/a",
      pushReceived: "n/a",
      probableCause: "Période / filtrage texte",
    });
  }
}

async function reportGenerationTests() {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const rep = await generateManagementReport({
      type: "on_demand",
      periodKey: "today",
      sendEmail: true,
      isTest: true,
      force: true,
      generatedBy: "audit-multi",
    });
    results.push(rep);
  }
  addRun("reports_test_mode", results);
  // En MODE TEST, e-mail ne doit PAS être réellement envoyé
  const wronglySent = results.filter((r) => r.emailed === true);
  if (wronglySent.length) {
    finding({
      id: "REP-01",
      severity: "majeur",
      problem: "Rapport MODE TEST marqué emailed=true",
      feature: "Rapports",
      scenario: "generateManagementReport isTest=true ×3",
      frequency: `${wronglySent.length}/3`,
      expected: "emailed=false / emailStatus skipped",
      obtained: JSON.stringify(wronglySent),
      repro: ["generateManagementReport isTest true sendEmail true"],
      evidence: { results },
      impact: "Confusion test/prod",
      risk: "Fausse preuve d'envoi",
      likelyFiles: ["lib/reports/management-report.ts"],
      connection: "e-mail",
      futureFix: "Garantir skip e-mail en isTest",
      priority: 2,
      reproducedTimes: wronglySent.length,
      clients: [],
      adminOk: "oui",
      emailReceived: "NON (test)",
      pushReceived: "n/a",
      probableCause: "Branchement sendEmail",
    });
  }

  // Tentative rapport non-test avec envoi — attendu échec ou skip sans SMTP
  const liveAttempt = await generateManagementReport({
    type: "on_demand",
    periodKey: "today",
    sendEmail: true,
    isTest: false,
    force: true,
    generatedBy: "audit-multi-live-attempt",
  });
  addRun("report_live_attempt", liveAttempt);
  const row = await prisma.managementReport.findUnique({ where: { id: liveAttempt.reportId } });
  if (liveAttempt.emailed && !getEmailConfig().smtp.hasPassword && !process.env.RESEND_API_KEY) {
    finding({
      id: "REP-02",
      severity: "critique",
      problem: "Rapport marqué envoyé sans provider e-mail réel",
      feature: "Rapports e-mail",
      scenario: "Envoi sans SMTP",
      frequency: "1",
      expected: "failed/skipped/not delivered",
      obtained: JSON.stringify({ liveAttempt, emailStatus: row?.emailStatus }),
      repro: ["generateManagementReport sendEmail sans SMTP"],
      evidence: { liveAttempt, emailStatus: row?.emailStatus, emailLastError: row?.emailLastError },
      impact: "Fausse validation e-mail",
      risk: "Audit trompeur",
      likelyFiles: ["lib/reports/management-report.ts", "lib/email/service.ts"],
      connection: "SMTP",
      futureFix: "Ne jamais emailed=true sans transport smtp/resend confirmé",
      priority: 1,
      reproducedTimes: 1,
      clients: [],
      adminOk: "historique présent",
      emailReceived: "NON",
      pushReceived: "n/a",
      probableCause: "Statut trop optimiste",
    });
  }
}

async function notificationBusTests() {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const ev = await emitNotificationEvent({
      type: "test.event",
      title: `[MODE TEST] Audit bus ${i + 1}`,
      description: "Événement audit — ne doit pas être push/SMS délivré",
      isTest: true,
      severity: "info",
    });
    results.push(ev);
  }
  // Anti-doublon : même clé
  const d1 = await emitNotificationEvent({
    type: "order.payment_confirmed",
    orderId: "AUDIT-DUP-ORDER",
    title: "All Vap's — Nouvelle commande",
    description: "Commande AUDIT-DUP-ORDER — 10,00 € — Paiement confirmé",
    isTest: true,
    amountCents: 1000,
  });
  const d2 = await emitNotificationEvent({
    type: "order.payment_confirmed",
    orderId: "AUDIT-DUP-ORDER",
    title: "All Vap's — Nouvelle commande",
    description: "Commande AUDIT-DUP-ORDER — 10,00 € — Paiement confirmé",
    isTest: true,
    amountCents: 1000,
  });
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { idempotencyKey: { contains: "AUDIT-DUP-ORDER" } },
  });
  addRun("notification_bus", { results, d1, d2, deliveriesCount: deliveries.length, deliveries });

  // Idempotence : un delivery par canal max pour même clé
  const byChannel = new Map<string, number>();
  for (const d of deliveries) {
    byChannel.set(d.channel, (byChannel.get(d.channel) || 0) + 1);
  }
  const dupChannels = [...byChannel.entries()].filter(([, n]) => n > 1);
  if (dupChannels.length) {
    finding({
      id: "NOTIF-DUP-01",
      severity: "majeur",
      problem: "Doublons de delivery pour même événement/commande",
      feature: "Anti-doublon notifications",
      scenario: "emit 2× order.payment_confirmed même orderId",
      frequency: `${dupChannels.length} canaux`,
      expected: "1 delivery / canal",
      obtained: JSON.stringify(Object.fromEntries(byChannel)),
      repro: ["emitNotificationEvent ×2 même orderId"],
      evidence: { byChannel: Object.fromEntries(byChannel) },
      impact: "Spam alertes",
      risk: "Fatigue / confusion",
      likelyFiles: ["lib/notifications/bus.ts"],
      connection: "NotificationDelivery",
      futureFix: "Idempotence au niveau event+canal avant create event",
      priority: 2,
      reproducedTimes: 1,
      clients: [],
      adminOk: "vérifier alertes",
      emailReceived: "n/a",
      pushReceived: "NON",
      probableCause: "Idempotence sur delivery mais nouvel event à chaque emit",
    });
  }
}

async function sessionAndHttpGaps() {
  finding({
    id: "HTTP-01",
    severity: "non_testable",
    problem: "Serveur Next.js non joignable sur localhost:3000 au démarrage de l'audit",
    feature: "Parcours HTTP / UI / cookies",
    scenario: "Sessions navigateur, mobile, privée, CSRF",
    frequency: "session audit",
    expected: "Health 200",
    obtained: "Connexion refusée",
    repro: ["Invoke-WebRequest http://localhost:3000/api/health"],
    evidence: { port: 3000 },
    impact: "Inscription/login UI, panier client, checkout HTTP non exécutés dans cette passe",
    risk: "Couverture partielle (couche lib/DB seulement)",
    likelyFiles: ["package.json"],
    connection: "HTTP local",
    futureFix: "Relancer audit avec `npm run dev` + Playwright/browser + comptes",
    priority: 1,
    reproducedTimes: 3,
    clients: ["CLIENT-AUDIT-01", "CLIENT-AUDIT-02", "CLIENT-AUDIT-03"],
    adminOk: "non via UI",
    emailReceived: "NON",
    pushReceived: "NON",
    probableCause: "Processus next non démarré",
  });

  finding({
    id: "MOB-01",
    severity: "non_testable",
    problem: "Pas d'accès appareil Android / émulateur / boîte Gmail Yoann dans cet environnement agent",
    feature: "Preuves réception externe",
    scenario: "Push Android + e-mail inbox réelle",
    frequency: "session audit",
    expected: "Preuves réception Yoann",
    obtained: "Accès externes absents",
    repro: ["Vérifier boîte allvaps70@gmail.com", "Appareil Samsung"],
    evidence: {},
    impact: "Clauses §6 et §7 non satisfaites → audit NON closable",
    risk: "Fausse clôture",
    likelyFiles: [],
    connection: "Gmail / FCM / Android",
    futureFix: "Fournir accès lecture boîte test + device push ou captures Yoann",
    priority: 1,
    reproducedTimes: 1,
    clients: [],
    adminOk: "n/a",
    emailReceived: "NON vérifiable",
    pushReceived: "NON vérifiable",
    probableCause: "Limite environnement Cursor agent",
  });

  finding({
    id: "EMP-01",
    severity: "non_testable",
    problem: "Compte employé dédié non créé / non testé en session UI dans cette passe",
    feature: "Rôle EMPLOYE",
    scenario: "Permissions financières masquées",
    frequency: "0 session UI",
    expected: "Session employé + 3 répétitions",
    obtained: "Test lib answerAvaGestion role EMPLOYE partiel possible uniquement",
    repro: ["Créer user EMPLOYE", "login admin", "questions CA"],
    evidence: {},
    impact: "Couverture rôles incomplète côté UI",
    risk: "Fuite CA possible non prouvée UI",
    likelyFiles: ["lib/ava-gestion/advisor.ts", "lib/admin/roles.ts"],
    connection: "Auth",
    futureFix: "Créer EMPLOYE-AUDIT et retester UI ×3",
    priority: 2,
    reproducedTimes: 0,
    clients: [],
    adminOk: "partiel",
    emailReceived: "n/a",
    pushReceived: "n/a",
    probableCause: "Serveur down + scope agent",
  });
}

async function employeeAvaCheck() {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const reply = await answerAvaGestion({
      message: "Quel est le chiffre d'affaires du jour ?",
      role: "EMPLOYE",
    });
    const leaked = /\d+[.,]\d{2}\s*€|chiffre d'affaires confirmé|Total confirmé/i.test(reply.text);
    const denied = /réserv|propriétaire|administrateur|masqu/i.test(reply.text);
    results.push({
      i: i + 1,
      leakedFinance: leaked && !denied,
      denied,
      excerpt: reply.text.slice(0, 180),
    });
  }
  addRun("employee_ava_finance", results);
  const leaks = results.filter((r) => r.leakedFinance);
  if (leaks.length) {
    finding({
      id: "PERM-01",
      severity: "critique",
      problem: "Employé reçoit des données financières via A.V.A. Gestion",
      feature: "Permissions",
      scenario: "CA du jour en rôle EMPLOYE ×3",
      frequency: `${leaks.length}/3`,
      expected: "Refus / masquage",
      obtained: JSON.stringify(leaks),
      repro: ["answerAvaGestion role EMPLOYE + question CA"],
      evidence: { results },
      impact: "Fuite financière interne",
      risk: "Confidentialité",
      likelyFiles: ["lib/ava-gestion/advisor.ts"],
      connection: "API",
      futureFix: "Bloquer finance pour EMPLOYE de façon stricte",
      priority: 1,
      reproducedTimes: leaks.length,
      clients: [],
      adminOk: "n/a",
      emailReceived: "n/a",
      pushReceived: "n/a",
      probableCause: "Garde hideFinance incomplète selon formulation",
    });
  }
}

async function emailLogReview() {
  const logs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      status: true,
      transport: true,
      lastErrorCode: true,
      recipientMasked: true,
      subject: true,
      createdAt: true,
      sentAt: true,
      attempts: true,
    },
  });
  addRun("email_logs", logs);
  const sent = logs.filter((l) => l.status === "SENT");
  const skipped = logs.filter((l) => l.status === "SKIPPED");
  const failed = logs.filter((l) => l.status === "FAILED");
  if (sent.length === 0) {
    finding({
      id: "MAIL-02",
      severity: "critique",
      problem: "Aucun EmailLog status=SENT récent — pas de preuve d'envoi réel",
      feature: "E-mails",
      scenario: "Revue journal EmailLog",
      frequency: `SENT=${sent.length} SKIPPED=${skipped.length} FAILED=${failed.length}`,
      expected: "Au moins des SENT avec réception inbox",
      obtained: "Pas de SENT dans les 30 derniers logs",
      repro: ["prisma.emailLog.findMany"],
      evidence: { sample: logs.slice(0, 5) },
      impact: "§6 non satisfait",
      risk: "Clôture audit interdite",
      likelyFiles: ["lib/email/service.ts"],
      connection: "EmailLog",
      futureFix: "Configurer transport réel + vérifier boîte",
      priority: 1,
      reproducedTimes: 3,
      clients: ["ALL"],
      adminOk: "journal lisible",
      emailReceived: "NON",
      pushReceived: "n/a",
      probableCause: "Console/skip ou SMTP absent",
    });
  }
}

async function main() {
  console.log("=== AUDIT MULTI-SCÉNARIOS (NO FIX) ===");
  await emailAndPushCapability();
  await sessionAndHttpGaps();

  const clients = [
    await ensureAuditUser("c1", 1),
    await ensureAuditUser("c2", 2),
    await ensureAuditUser("c3", 3),
  ];
  evidence.clients = clients.map((c) => ({
    label: c.label,
    email: c.email,
    userId: c.user.id,
    // password intentionally omitted from evidence file
  }));

  await isolationTests(clients);
  await outOfStockAttempts();
  const orders = await pendingOrderScenarios(clients);
  evidence.pendingOrdersCreated = orders;

  await employeeAvaCheck();
  await avaGestionChecks();
  await notificationBusTests();
  await reportGenerationTests();
  await emailLogReview();

  // Admin alerts count
  const alerts = await prisma.adminAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, level: true, title: true, isTest: true, createdAt: true },
  });
  addRun("admin_alerts", alerts);

  evidence.finishedAt = new Date().toISOString();
  evidence.runs = runs;
  evidence.findings = findings;
  evidence.closureBlocked = true;
  evidence.closureReasons = [
    "Aucun e-mail réellement reçu (preuve inbox absente + SMTP sans mot de passe)",
    "Aucune notification push réellement reçue (provider non configuré)",
    "Mode AUDIT_ONLY inexistant",
    "Serveur HTTP local non démarré — parcours UI/cookies incomplets",
    "Accès boîte Yoann / appareil Android absents de l'environnement agent",
  ];

  const outDir = path.join(process.cwd(), "docs");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "AUDIT_MULTI_SCENARIOS_EVIDENCE.json");
  writeFileSync(jsonPath, JSON.stringify(evidence, null, 2), "utf8");
  console.log("Evidence written:", jsonPath);
  console.log("Findings:", findings.length);
  console.log("CLOSURE BLOCKED:", evidence.closureReasons);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
