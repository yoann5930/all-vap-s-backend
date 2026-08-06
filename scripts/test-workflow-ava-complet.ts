/**
 * Test circuit workflow A.V.A. — documents, mémoire, MR/RC mode assisté.
 * Conserve toutes les données. Aucune suppression.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";

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

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const campaignId = `WF-AVA-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const outDir = join("docs", "test-client", campaignId, "evidence");
mkdirSync(outDir, { recursive: true });
mkdirSync(join("docs", "test-client", campaignId, "logs"), { recursive: true });

function log(m: string) {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  appendFileSync(join("docs", "test-client", campaignId, "logs", "run.log"), line + "\n");
}
function save(name: string, data: unknown) {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2));
}

async function req(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}
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
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, setCookie };
}

function mergeCookies(prev: string, setCookie: string[]) {
  const jar = new Map<string, string>();
  for (const part of (prev || "").split(";").map((s) => s.trim()).filter(Boolean)) {
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

async function fakeOfficialPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("ETIQUETTE OFFICIELLE TEST — NE PAS EXPEDIER", {
    x: 20,
    y: 100,
    size: 10,
    font,
  });
  return Buffer.from(await pdf.save());
}

async function main() {
  log(`START ${campaignId}`);
  if (process.env.PAYMENT_TEST_MODE !== "true") {
    log("ABORT payment test mode off");
    process.exit(2);
  }

  const health = await req("/api/health");
  save("00-health.json", health.json);
  const shipOpts = await req("/api/shipping/options");
  save("00-shipping-options.json", shipOpts.json);
  const hasColissimo = ((shipOpts.json as any)?.options || []).some(
    (o: any) => o.id === "COLISSIMO"
  );
  log(`shipping colissimoExcluded=${!hasColissimo}`);

  const adminPass =
    process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || "Admin123!";
  let adminLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "admin@allvaps.fr", password: adminPass },
  });
  if (adminLogin.status !== 200) {
    adminLogin = await req("/api/auth/login", {
      method: "POST",
      body: { email: "allvaps70@gmail.com", password: adminPass },
    });
  }
  const adminCookie = mergeCookies("", adminLogin.setCookie);
  log(`admin=${adminLogin.status}`);

  const secrets = existsSync("tmp/client-test-campaign-secrets.json")
    ? JSON.parse(readFileSync("tmp/client-test-campaign-secrets.json", "utf8"))
    : { auditSecret: process.env.AUDIT_MODE_SECRET };
  if (secrets.auditSecret) {
    await req("/api/admin/audit-mode", {
      method: "POST",
      cookie: adminCookie,
      body: {
        action: "activate",
        campaignId,
        secret: secrets.auditSecret,
        expiresInHours: 8,
        allowOutOfStock: true,
      },
    });
  }

  const products = ((await req("/api/products?inStock=true&limit=8")).json as any)?.products || [];
  if (products.length < 2) throw new Error("NO_PRODUCTS");

  const mailBase = process.env.MAIL_TEST_RECIPIENT || process.env.SMTP_USER || "";
  const [local, domain] = mailBase.split("@");
  const scenarios = [
    { tag: "mr", delivery: "MONDIAL_RELAY" as const },
    { tag: "rc", delivery: "RELAIS_COLIS" as const },
  ];

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const results: any[] = [];

  for (const sc of scenarios) {
    const email = `${local}+wf.${sc.tag}.${campaignId.slice(-6)}@${domain}`.toLowerCase();
    const password = `TestWf1-${sc.tag}!`;
    log(`--- ${sc.delivery} ${email[0]}***@${domain}`);

    const reg = await req("/api/auth/register", {
      method: "POST",
      body: {
        email,
        password,
        passwordConfirm: password,
        firstName: "Client",
        lastName: `Workflow ${sc.tag}`,
        phone: "0600112233",
        adultConfirmed: true,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    let cookie = mergeCookies("", reg.setCookie);
    const user = await prisma.user.findUnique({ where: { email } });
    const tok = user
      ? await prisma.emailConfirmationToken.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (tok) await req("/api/auth/confirm", { method: "POST", body: { token: tok.token } });
    cookie = mergeCookies(
      "",
      (
        await req("/api/auth/login", {
          method: "POST",
          body: { email, password },
        })
      ).setCookie
    );

    const orderRes = await req("/api/orders", {
      method: "POST",
      cookie,
      headers: secrets.auditSecret ? { "x-audit-secret": secrets.auditSecret } : {},
      body: {
        customerEmail: email,
        customerName: `Client Workflow ${sc.tag}`,
        shippingAddress: `Point relais TEST ${sc.delivery} — NE PAS EXPÉDIER — ${campaignId}`,
        deliveryMethod: sc.delivery,
        auditSecret: secrets.auditSecret,
        items: [
          { productId: products[0].id, quantity: 1 },
          { productId: products[1].id, quantity: 1 },
        ],
      },
    });
    const order = orderRes.json as any;
    save(`${sc.tag}-order.json`, { status: orderRes.status, body: order });
    if (orderRes.status !== 201) {
      results.push({ ...sc, error: "ORDER_FAILED", orderRes });
      continue;
    }

    const pay = await req("/api/payments/checkout", {
      method: "POST",
      cookie,
      body: { orderId: order.id, checkoutToken: order.checkoutToken },
    });
    const checkoutId = (pay.json as any)?.checkoutId;
    if (!String(checkoutId || "").startsWith("TEST_")) {
      results.push({ ...sc, error: "NON_TEST_PAYMENT", pay: pay.json });
      continue;
    }
    const st = await req(`/api/payments/status?orderId=${order.id}`, { cookie });
    // double sync idempotence
    await req(`/api/payments/status?orderId=${order.id}`, { cookie });

    const docs = await prisma.orderDocument.findMany({ where: { orderId: order.id } });
    const emails = await prisma.emailLog.findMany({
      where: { relatedOrderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    const shipments = await prisma.carrierShipment.findMany({ where: { orderId: order.id } });
    const artifacts = await prisma.avaMemoryArtifact.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });

    // Import assisted label
    const pdf = await fakeOfficialPdf();
    const tracking = `TEST-${sc.tag.toUpperCase()}-${order.id.slice(-6).toUpperCase()}`;
    const imported = await req("/api/admin/shipments", {
      method: "POST",
      cookie: adminCookie,
      body: {
        orderId: order.id,
        trackingNumber: tracking,
        labelPdfBase64: pdf.toString("base64"),
        fileName: `${sc.tag}-label-test.pdf`,
      },
    });
    // second import same tracking = idempotent
    const imported2 = await req("/api/admin/shipments", {
      method: "POST",
      cookie: adminCookie,
      body: {
        orderId: order.id,
        trackingNumber: tracking,
        labelPdfBase64: pdf.toString("base64"),
      },
    });

    const mem = await req(`/api/admin/ava-memory?userId=${user?.id}`, {
      cookie: adminCookie,
    });
    const avaQ = await req("/api/admin/ava-gestion", {
      method: "POST",
      cookie: adminCookie,
      body: { message: `Quelle est la dernière commande du client ${email} ?` },
    });

    const docTypes = docs.map((d) => d.type).sort();
    const prepToCustomer = emails.some(
      (e) => /préparation/i.test(e.subject) && e.recipientMasked?.startsWith(email[0])
    );

    results.push({
      delivery: sc.delivery,
      orderId: order.id,
      isAudit: (await prisma.order.findUnique({ where: { id: order.id } }))?.isAudit,
      paymentStatus: (st.json as any)?.status,
      checkoutId,
      documentTypes: docTypes,
      documentCount: docs.length,
      uniqueDocTypes: new Set(docTypes).size === docTypes.length,
      prepSlip: docs.find((d) => d.type === "PREP_SLIP"),
      emails: emails.map((e) => ({
        type: e.type,
        status: e.status,
        transport: e.transport,
        subject: e.subject,
        recipientMasked: e.recipientMasked,
        idempotencyKey: e.idempotencyKey,
      })),
      emailIdempotentKeysUnique:
        new Set(emails.map((e) => e.idempotencyKey).filter(Boolean)).size ===
        emails.filter((e) => e.idempotencyKey).length,
      shipments,
      import1: imported.json,
      import2: imported2.json,
      artifactsCount: artifacts.length,
      memoryOk: !!(mem.json as any)?.dossier,
      avaReply: (avaQ.json as any)?.text?.slice(0, 400),
      prepNeverToCustomerHeuristic: !prepToCustomer,
      laPosteExcluded: !hasColissimo,
    });
    save(`${sc.tag}-bundle.json`, results[results.length - 1]);
  }

  // Reject Colissimo attempt
  const rejectEmail = `${local}+wf.colissimo.${campaignId.slice(-6)}@${domain}`.toLowerCase();
  // skip full register — just assert shipping API
  save("99-results.json", {
    campaignId,
    results,
    preserved: true,
    cleanup: "EN ATTENTE DE VALIDATION ET DE NETTOYAGE PAR YOANN",
    colissimoPublic: hasColissimo,
  });
  log("DONE");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
