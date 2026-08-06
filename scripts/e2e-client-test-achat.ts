/**
 * E2E client test — campagne CLIENT-TEST-ACHAT-*
 * Paiement TEST local uniquement. Conserve toutes les données.
 * Aucun nettoyage automatique.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const BASE =
  process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ROOT = process.cwd();
const campaignId =
  (existsSync("docs/test-client/LATEST_CAMPAIGN.txt")
    ? readFileSync("docs/test-client/LATEST_CAMPAIGN.txt", "utf8").trim()
    : "") ||
  `CLIENT-TEST-ACHAT-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const campDir = join(ROOT, "docs/test-client", campaignId);
const evidenceDir = join(campDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(join(campDir, "logs"), { recursive: true });

const secrets = existsSync("tmp/client-test-campaign-secrets.json")
  ? JSON.parse(readFileSync("tmp/client-test-campaign-secrets.json", "utf8"))
  : { campaignId, auditSecret: process.env.AUDIT_MODE_SECRET };

function maskEmail(e: string) {
  const [a, b] = e.split("@");
  return `${a?.[0] || "*"}***@${b || ""}`;
}
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(campDir, "logs", "run.log"), line + "\n");
}
function saveJson(name: string, data: unknown) {
  writeFileSync(join(evidenceDir, name), JSON.stringify(data, null, 2), "utf8");
}

async function req(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: BASE,
    Referer: `${BASE}/`,
    ...(opts.headers || {}),
  };
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, setCookie, headers: res.headers };
}

function mergeCookies(prev: string, setCookie: string[]) {
  const jar = new Map<string, string>();
  for (const part of (prev || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const c of setCookie) {
    const first = c.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  log(`START campaign=${campaignId} base=${BASE}`);

  const health = await req("/api/health");
  saveJson("00-health.json", health.json);
  const h = health.json as Record<string, any>;
  const paymentDetail = h?.services?.payment?.detail;
  const emailStatus = h?.services?.email?.status;
  log(
    `health ok=${h?.ok} email=${emailStatus} payment=${paymentDetail} audit=${JSON.stringify(h?.audit)} mailTestMode env=${process.env.MAIL_TEST_MODE}`
  );

  if (paymentDetail !== "payment_test_mode") {
    log("ABORT: paiement test non actif — aucun paiement lancé");
    saveJson("ABORT.json", { reason: "PAYMENT_TEST_MODE_NOT_ACTIVE", health: h });
    process.exit(2);
  }
  if (emailStatus !== "healthy") {
    log("ABORT: SMTP non healthy");
    process.exit(2);
  }

  const adminPass =
    process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || "Admin123!";
  let adminCookie = "";
  let login = await req("/api/auth/login", {
    method: "POST",
    body: { email: "admin@allvaps.fr", password: adminPass },
  });
  if (login.status !== 200) {
    login = await req("/api/auth/login", {
      method: "POST",
      body: { email: "allvaps70@gmail.com", password: adminPass },
    });
  }
  adminCookie = mergeCookies("", login.setCookie);
  log(`admin login status=${login.status}`);
  if (login.status !== 200) {
    saveJson("ABORT-admin-login.json", { status: login.status, body: login.json });
    process.exit(2);
  }

  const auditSecret = secrets.auditSecret || process.env.AUDIT_MODE_SECRET;
  if (!auditSecret || String(auditSecret).length < 16) {
    log("ABORT: audit secret manquant");
    process.exit(2);
  }
  const act = await req("/api/admin/audit-mode", {
    method: "POST",
    cookie: adminCookie,
    body: {
      action: "activate",
      campaignId,
      secret: auditSecret,
      expiresInHours: 12,
      allowOutOfStock: false,
    },
  });
  saveJson("01-audit-activate.json", { status: act.status, body: act.json });
  log(`audit activate status=${act.status}`);

  const payProbe = await req("/api/payments/checkout", { cookie: adminCookie });
  saveJson("01b-payment-probe.json", payProbe.json);
  log(`payment probe ${JSON.stringify(payProbe.json)}`);

  const productsRes = await req("/api/products?inStock=true&limit=24");
  const products = ((productsRes.json as any)?.products || []) as any[];
  if (products.length < 2) {
    log("ABORT: pas assez de produits en stock");
    process.exit(2);
  }
  const p1 = products[0];
  const p2 = products[1];
  const p3 = products[2] || products[0];
  saveJson("02-products.json", {
    selected: [p1, p2, p3].map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      stock: p.stock,
      priceCents: p.priceCents ?? p.price,
      brand: p.brand,
    })),
  });

  const mailBase = process.env.MAIL_TEST_RECIPIENT || process.env.SMTP_USER || "";
  if (!mailBase.includes("@")) {
    log("ABORT: pas d'email de test de base");
    process.exit(2);
  }
  const [local, domain] = mailBase.split("@");

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const scenarios = [
    { alias: "CLIENT-TEST-01", delivery: "STORE_PICKUP" as const, tag: "01" },
    { alias: "CLIENT-TEST-02", delivery: "MONDIAL_RELAY" as const, tag: "02" },
    { alias: "CLIENT-TEST-03", delivery: "RELAIS_COLIS" as const, tag: "03" },
  ];

  const results: any[] = [];

  for (const sc of scenarios) {
    const email = `${local}+${sc.tag}.${campaignId.slice(-6)}@${domain}`.toLowerCase();
    const password = `TestAv1-${sc.tag}!`;
    log(`--- ${sc.alias} email=${maskEmail(email)} delivery=${sc.delivery}`);

    const reg = await req("/api/auth/register", {
      method: "POST",
      body: {
        email,
        password,
        passwordConfirm: password,
        firstName: "Client",
        lastName: `Test All Vap's ${sc.tag}`,
        phone: `06000000${sc.tag}`,
        adultConfirmed: true,
        acceptTerms: true,
        acceptPrivacy: true,
        newsletter: false,
      },
    });
    let cookie = mergeCookies("", reg.setCookie);
    saveJson(`${sc.tag}-register.json`, {
      status: reg.status,
      body: reg.json,
      emailMasked: maskEmail(email),
    });
    log(`register status=${reg.status}`);
    if (reg.status !== 201 && reg.status !== 200) {
      results.push({ ...sc, error: "REGISTER_FAILED", status: reg.status, body: reg.json });
      continue;
    }

    const userRow = await prisma.user.findUnique({ where: { email } });

    let confirmToken: string | null = null;
    if (userRow) {
      const tok = await prisma.emailConfirmationToken.findFirst({
        where: { userId: userRow.id },
        orderBy: { createdAt: "desc" },
      });
      confirmToken = tok?.token || null;
    }

    if (confirmToken) {
      const conf = await req("/api/auth/confirm", {
        method: "POST",
        body: { token: confirmToken },
      });
      saveJson(`${sc.tag}-confirm.json`, { status: conf.status, body: conf.json });
      log(`confirm status=${conf.status}`);
    } else if (userRow) {
      await prisma.user.update({
        where: { id: userRow.id },
        data: { emailVerified: true },
      });
      log("confirm FALLBACK prisma emailVerified=true (token introuvable — documenté)");
      saveJson(`${sc.tag}-confirm-fallback.json`, {
        userId: userRow.id,
        reason: "TOKEN_NOT_FOUND",
      });
    }

    cookie = "";
    const loginClient = await req("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    cookie = mergeCookies("", loginClient.setCookie);
    log(`client login status=${loginClient.status}`);

    const items = [
      { productId: p1.id, quantity: 1 },
      { productId: p2.id, quantity: 2 },
    ];
    if (p3.id !== p1.id && p3.id !== p2.id) {
      items.push({ productId: p3.id, quantity: 1 });
    }

    const shippingAddress =
      sc.delivery === "STORE_PICKUP"
        ? `Retrait test — All Vap's Hautmont — NE PAS EXPÉDIER — Campagne ${campaignId}`
        : `Point relais TEST ${sc.delivery} — 1 rue du Test, 59330 Hautmont — NE PAS EXPÉDIER — ${campaignId}`;

    const orderRes = await req("/api/orders", {
      method: "POST",
      cookie,
      body: {
        customerEmail: email,
        customerName: `Client Test All Vap's ${sc.tag}`,
        shippingAddress,
        deliveryMethod: sc.delivery,
        pickupStoreId: sc.delivery === "STORE_PICKUP" ? "hautmont" : undefined,
        auditSecret,
        items,
      },
      headers: { "x-audit-secret": String(auditSecret) },
    });
    saveJson(`${sc.tag}-order.json`, { status: orderRes.status, body: orderRes.json });
    log(`order status=${orderRes.status}`);
    const order = orderRes.json as any;
    if (orderRes.status !== 200 && orderRes.status !== 201) {
      results.push({
        ...sc,
        emailMasked: maskEmail(email),
        error: "ORDER_FAILED",
        status: orderRes.status,
        body: orderRes.json,
      });
      continue;
    }

    const orderId = order.id || order.orderId;
    const checkoutToken = order.checkoutToken;

    const pay1 = await req("/api/payments/checkout", {
      method: "POST",
      cookie,
      body: { orderId, checkoutToken },
    });
    const pay2 = await req("/api/payments/checkout", {
      method: "POST",
      cookie,
      body: { orderId, checkoutToken },
    });
    saveJson(`${sc.tag}-payment-checkout.json`, {
      pay1: { status: pay1.status, body: pay1.json },
      pay2: { status: pay2.status, body: pay2.json },
    });
    log(`payment checkout1=${pay1.status} checkout2=${pay2.status}`);

    const redirectUrl =
      (pay1.json as any)?.redirectUrl || (pay2.json as any)?.redirectUrl;
    const checkoutId =
      (pay1.json as any)?.checkoutId || (pay2.json as any)?.checkoutId;
    if (!String(checkoutId || "").startsWith("TEST_")) {
      log(`ABORT payment non-test checkoutId=${checkoutId}`);
      saveJson(`${sc.tag}-ABORT-real-payment.json`, {
        pay1: pay1.json,
        pay2: pay2.json,
      });
      results.push({ ...sc, error: "NON_TEST_PAYMENT_BLOCKED", checkoutId });
      continue;
    }

    const status1 = await req(`/api/payments/status?orderId=${orderId}`, { cookie });
    const status2 = await req(`/api/payments/status?orderId=${orderId}`, { cookie });
    saveJson(`${sc.tag}-payment-status.json`, {
      status1: status1.json,
      status2: status2.json,
      redirectUrl,
    });
    log(
      `payment status1=${JSON.stringify(status1.json)} status2=${JSON.stringify(status2.json)}`
    );

    const orderDb = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, documents: true },
    });
    const emailsPrecise = await prisma.emailLog.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        OR: [{ relatedOrderId: orderId }, { relatedCustomerId: userRow?.id }],
      },
      orderBy: { createdAt: "asc" },
    });

    results.push({
      alias: sc.alias,
      tag: sc.tag,
      delivery: sc.delivery,
      emailMasked: maskEmail(email),
      userId: userRow?.id,
      orderId,
      checkoutId,
      orderStatus: orderDb?.status,
      isAudit: orderDb?.isAudit,
      auditCampaignId: orderDb?.auditCampaignId,
      totalCents: orderDb?.totalCents,
      itemCount: orderDb?.items?.length,
      documentCount: (orderDb as any)?.documents?.length,
      emails: emailsPrecise.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        transport: e.transport,
        subject: e.subject,
        recipientMasked: e.recipientMasked,
        lastErrorCode: e.lastErrorCode,
        sentAt: e.sentAt,
        createdAt: e.createdAt,
      })),
      paymentTest: String(checkoutId).startsWith("TEST_"),
      redirectUrl,
    });
  }

  const adminOrders = await req("/api/admin/orders", { cookie: adminCookie });
  const allOrders = (adminOrders.json as any)?.orders || adminOrders.json || [];
  const campOrders = (Array.isArray(allOrders) ? allOrders : []).filter(
    (o: any) => o.auditCampaignId === campaignId || o.isAudit === true
  );
  saveJson("90-admin-orders-campaign.json", campOrders);

  const avaQs = [
    "Quelle commande de test vient d’être passée ?",
    "Le paiement a-t-il été confirmé ?",
    "Quels e-mails ont réellement été envoyés ?",
    "Quels e-mails ont réellement été reçus ?",
    "Y a-t-il eu des doublons ?",
    "Cette commande est-elle exclue des chiffres de production ?",
    "Quelle action doit faire l’administrateur ?",
  ];
  const avaAnswers: any[] = [];
  for (const q of avaQs) {
    const a = await req("/api/admin/ava-gestion", {
      method: "POST",
      cookie: adminCookie,
      body: { message: q },
    });
    avaAnswers.push({ q, status: a.status, body: a.json });
  }
  saveJson("91-ava-gestion.json", avaAnswers);

  const allEmailLogs = await prisma.emailLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  saveJson(
    "92-email-logs-recent.json",
    allEmailLogs.map((e) => ({
      id: e.id,
      type: e.type,
      status: e.status,
      transport: e.transport,
      subject: e.subject,
      recipientMasked: e.recipientMasked,
      relatedOrderId: e.relatedOrderId,
      lastErrorCode: e.lastErrorCode,
      sentAt: e.sentAt,
      createdAt: e.createdAt,
    }))
  );

  saveJson("99-results.json", {
    campaignId,
    results,
    preserved: true,
    cleanup: "EN ATTENTE DE VALIDATION ET DE NETTOYAGE PAR YOANN",
  });
  log("DONE — données conservées, pas de nettoyage");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
