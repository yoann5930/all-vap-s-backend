/**
 * Test bout-en-bout : inventaire employé + consultation admin Yoann
 * (prix, photo, audit, exports, refus employé).
 *
 * Usage: DEMO_MODE=true npx tsx scripts/test-inventory-admin-tracking.ts
 */
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";

type Jar = Map<string, string>;

function parseSetCookie(header: string | null, jar: Jar) {
  if (!header) return;
  // undici may join multiple set-cookie; handle simple name=value
  const parts = header.split(/,(?=\s*[^;=]+=[^;]+)/);
  for (const p of parts) {
    const m = p.trim().match(/^([^=]+)=([^;]*)/);
    if (m) jar.set(m[1], m[2]);
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(
  jar: Jar,
  method: string,
  urlPath: string,
  body?: unknown,
  init?: RequestInit
) {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (jar.size) headers.cookie = cookieHeader(jar);
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  const raw = res.headers.getSetCookie?.() || [];
  if (raw.length) {
    for (const c of raw) {
      const m = c.match(/^([^=]+)=([^;]*)/);
      if (m) jar.set(m[1], m[2]);
    }
  } else {
    parseSetCookie(res.headers.get("set-cookie"), jar);
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function login(email: string, password: string) {
  const jar: Jar = new Map();
  const { res, json } = await req(jar, "POST", "/api/auth/login", { email, password });
  assert(res.ok, `login ${email}: ${json.error || res.status}`);
  return jar;
}

async function main() {
  const results: string[] = [];
  const log = (s: string) => {
    results.push(s);
    console.log(s);
  };

  // Credentials démo staff
  const employeeEmail = process.env.TEST_EMPLOYEE_EMAIL || "lilie.froment@allvaps.fr";
  const adminEmail = process.env.TEST_ADMIN_EMAIL || "yoann@allvaps.fr";
  // Mots de passe : relire fichier local si présent, sinon env
  let employeePassword = process.env.TEST_EMPLOYEE_PASSWORD || "";
  let adminPassword = process.env.TEST_ADMIN_PASSWORD || "";
  try {
    const fs = await import("node:fs/promises");
    const creds = await fs.readFile(".local/inventory-user-credentials.txt", "utf8");
    const block = (email: string) => {
      const re = new RegExp(
        `Email\\s*:\\s*${email.replace(".", "\\.")}[\\s\\S]*?MDP tmp\\s*:\\s*(\\S+)`,
        "i"
      );
      return creds.match(re)?.[1];
    };
    employeePassword = block(employeeEmail) || employeePassword;
    adminPassword = block(adminEmail) || adminPassword;
  } catch {
    /* ignore */
  }
  if (!employeePassword || !adminPassword) {
    throw new Error("Mots de passe staff introuvables (.local/inventory-user-credentials.txt)");
  }

  log(`Base URL: ${BASE}`);

  async function ensurePasswordUsable(jar: Jar, currentPassword: string) {
    const me = await req(jar, "GET", "/api/auth/me");
    const user = me.json.user as { mustChangePassword?: boolean } | undefined;
    if (!user?.mustChangePassword) return;
    const next = `TestInv${Date.now()}!aA1`;
    const ch = await req(jar, "POST", "/api/auth/change-password", {
      currentPassword,
      newPassword: next,
    });
    assert(ch.res.ok, `change-password: ${JSON.stringify(ch.json)}`);
    log("OK mot de passe temporaire changé pour le test");
    return next;
  }

  // 1) Login employé
  const empJar = await login(employeeEmail, employeePassword);
  log(`OK login employé ${employeeEmail}`);
  await ensurePasswordUsable(empJar, employeePassword);

  // Lookup catalogue — produits via le store du serveur (pas un autre process)
  // Login admin anticipé pour fixture DEMO
  const adminJarEarly = await login(adminEmail, adminPassword);
  await ensurePasswordUsable(adminJarEarly, adminPassword);

  const { default: prisma } = await import("../lib/prisma");
  // Lecture locale uniquement pour IDs/barcodes (seed identique) — mutations via API serveur
  const withPrice = await prisma.product.findFirst({
    where: { barcode: { not: null }, priceCents: { gt: 0 }, isActive: true },
    select: { id: true, name: true, barcode: true, priceCents: true },
  });
  assert(withPrice?.barcode, "Aucun produit avec barcode+prix en démo");

  const noPrice = await prisma.product.findFirst({
    where: {
      barcode: { not: null },
      isActive: true,
      id: { not: withPrice!.id },
    },
    select: { id: true, barcode: true, name: true },
  });
  assert(noPrice?.barcode, "Deuxième produit requis");

  const fix = await req(adminJarEarly, "POST", "/api/admin/demo-fixtures/set-product-price", {
    productId: noPrice!.id,
    priceCents: 0,
  });
  assert(fix.res.ok, `fixture prix 0: ${JSON.stringify(fix.json)}`);
  log(`OK produits: avec prix=${withPrice!.barcode} / sans prix=${noPrice!.barcode}`);

  // Démarrer session
  const start = await req(empJar, "POST", "/api/inventaire/sessions", {
    locationCode: "HAUTMONT",
  });
  assert(start.res.ok, `start session: ${JSON.stringify(start.json)}`);
  const session = start.json.session as { id: string };
  log(`OK session ${session.id}`);

  // Lookup avec prix
  const look1 = await req(
    empJar,
    "GET",
    `/api/inventaire/lookup?barcode=${encodeURIComponent(withPrice!.barcode!)}`
  );
  assert(look1.json.found === true, "lookup produit connu");
  assert(look1.json.priceMissing === false, "prix catalogue présent");
  log("OK lookup produit avec prix");

  // Ligne 1 — quantité 2, prix catalogue
  const line1 = await req(empJar, "POST", `/api/inventaire/sessions/${session.id}/lines`, {
    barcode: withPrice!.barcode,
    quantityCounted: 2,
    unitPriceCents: withPrice!.priceCents,
    priceSource: "CATALOGUE",
  });
  assert(line1.res.status === 201, `line1: ${JSON.stringify(line1.json)}`);
  const l1 = line1.json.line as {
    id: string;
    unitPriceCents: number;
    totalValueCents: number;
    productNameSnapshot: string;
  };
  assert(l1.totalValueCents === 2 * withPrice!.priceCents, "total ligne 1");
  assert(l1.productNameSnapshot, "snapshot nom");
  log(`OK ligne 1 qty=2 total=${l1.totalValueCents}`);

  // Lookup sans prix
  const look2 = await req(
    empJar,
    "GET",
    `/api/inventaire/lookup?barcode=${encodeURIComponent(noPrice!.barcode!)}`
  );
  assert(look2.json.priceMissing === true, "prix manquant détecté");

  // Refus sans prix
  const line2fail = await req(empJar, "POST", `/api/inventaire/sessions/${session.id}/lines`, {
    barcode: noPrice!.barcode,
    quantityCounted: 3,
  });
  assert(line2fail.res.status === 400, "refus ligne sans prix");
  log("OK refus saisie sans prix");

  // Ligne 2 avec prix manuel
  const line2 = await req(empJar, "POST", `/api/inventaire/sessions/${session.id}/lines`, {
    barcode: noPrice!.barcode,
    quantityCounted: 3,
    unitPrice: "19,90",
    priceSource: "SAISIE_MANUELLE",
  });
  assert(line2.res.status === 201, `line2: ${JSON.stringify(line2.json)}`);
  const l2 = line2.json.line as { id: string; unitPriceCents: number; totalValueCents: number };
  assert(l2.unitPriceCents === 1990, "prix 19,90");
  assert(l2.totalValueCents === 1990 * 3, "total ligne 2");
  log("OK ligne 2 prix manuel 19,90 × 3");

  // Photo réelle (1x1 png)
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.set("file", new Blob([png], { type: "image/png" }), "test-inventory.png");
  form.set("lineId", l2.id);
  const photo = await req(
    empJar,
    "POST",
    `/api/inventaire/sessions/${session.id}/photos`,
    form
  );
  assert(photo.res.ok, `photo: ${JSON.stringify(photo.json)}`);
  const photoPath = String((photo.json as { photoPath?: string }).photoPath || "");
  assert(photoPath.length > 0, "photoPath enregistré");
  log(`OK photo ${photoPath}`);

  // Compléter session
  const complete = await req(empJar, "POST", `/api/inventaire/sessions/${session.id}/complete`);
  assert(complete.res.ok, `complete: ${JSON.stringify(complete.json)}`);
  log("OK session terminée (COMPLETED)");

  // Login Yoann admin (réutilise jar si déjà ouvert)
  const adminJar = adminJarEarly;
  log(`OK login admin ${adminEmail}`);

  // Liste inventaires
  const list = await req(adminJar, "GET", "/api/admin/inventaires");
  assert(list.res.ok, `list: ${list.res.status}`);
  const inventaires = (list.json.inventaires as Array<{ id: string }>) || [];
  assert(
    inventaires.some((i) => i.id === session.id),
    "session visible dans liste admin"
  );
  log("OK liste admin Inventaires");

  // Détail
  const detail = await req(adminJar, "GET", `/api/admin/inventaires/${session.id}`);
  assert(detail.res.ok, `detail: ${detail.res.status}`);
  const inv = detail.json.inventaire as {
    lines: Array<{
      id: string;
      quantityCounted: number;
      unitPriceCents: number;
      productNameSnapshot: string | null;
      barcode: string | null;
      photos: Array<{ publicUrl: string }>;
      photoPath: string | null;
    }>;
    summary: { photoCount: number; totalQuantity: number; totalValueCents: number };
    inventoryAudits: unknown[];
    employeeName: string;
    location: { name: string };
  };
  assert(inv.lines.length >= 2, "2 lignes dans détail");
  assert(inv.summary.totalQuantity === 5, "qté totale 2+3");
  assert(inv.summary.photoCount >= 1, "photo comptée");
  const lineWithPhoto = inv.lines.find((l) => l.id === l2.id);
  assert(lineWithPhoto?.photos?.length || lineWithPhoto?.photoPath, "photo liée à la ligne");
  assert(
    inv.lines.some((l) => l.productNameSnapshot || l.barcode),
    "nom/barcode visibles"
  );
  log(
    `OK détail admin — employé=${inv.employeeName} boutique=${inv.location.name} valeur=${inv.summary.totalValueCents}`
  );

  // Refus accès admin inventaires pour employé
  const forbid = await req(empJar, "GET", "/api/admin/inventaires");
  assert(forbid.res.status === 401 || forbid.res.status === 403, "employé refusé sur admin inventaires");
  log("OK refus employé sur /api/admin/inventaires");

  // Correction admin quantité
  const patch = await req(adminJar, "PATCH", `/api/admin/inventaires/${session.id}/lines/${l1.id}`, {
    quantityCounted: 5,
    reason: "Correction test Yoann",
  });
  assert(patch.res.ok, `patch: ${JSON.stringify(patch.json)}`);
  log("OK correction quantité admin");

  // Audit
  const detail2 = await req(adminJar, "GET", `/api/admin/inventaires/${session.id}`);
  const audits = (detail2.json.inventaire as { inventoryAudits: Array<{ action: string }> })
    .inventoryAudits;
  assert(
    audits.some((a) => a.action === "LINE_UPDATED" || a.action === "LINE_CREATED"),
    "audit présent"
  );
  log(`OK audit (${audits.length} entrées)`);

  // Exports
  for (const format of ["csv", "xlsx", "pdf"] as const) {
    const ex = await fetch(`${BASE}/api/admin/inventaires/${session.id}/export?format=${format}`, {
      headers: { cookie: cookieHeader(adminJar) },
    });
    assert(ex.ok, `export ${format}: ${ex.status}`);
    const buf = Buffer.from(await ex.arrayBuffer());
    assert(buf.length > 20, `export ${format} non vide`);
    log(`OK export ${format} (${buf.length} octets)`);
  }

  // Persistance photo fichier local
  if (photoPath.startsWith("/uploads/")) {
    const abs = path.join(process.cwd(), "public", photoPath.replace(/^\//, ""));
    const { access } = await import("node:fs/promises");
    await access(abs);
    log("OK fichier photo présent sur disque");
  } else {
    log(`INFO photo URL non locale: ${photoPath}`);
  }

  // Rapport
  const reportDir = "/opt/cursor/artifacts";
  await mkdir(reportDir, { recursive: true });
  const report = [
    "# Rapport suivi inventaire admin",
    "",
    `Date: ${new Date().toISOString()}`,
    `Session test: ${session.id}`,
    `Employé test: ${employeeEmail}`,
    `Admin: ${adminEmail}`,
    "",
    "## Résultats",
    ...results.map((r) => `- ${r}`),
    "",
    "## Essai précédent (avant ce correctif)",
    "",
    "En `DEMO_MODE=true`, les sessions vivent en mémoire du process Node.",
    "Un redémarrage du serveur efface les inventaires — d'où l'absence de l'essai réel dans l'admin.",
    "Des fichiers orphelins peuvent rester dans `public/uploads/inventory/` sans ligne DB.",
    "Cause documentée : pas d'affichage admin dédié + pas de prix/photo structurés + store démo volatile.",
    "",
    `Checksum script: ${createHash("sha1").update(results.join("\n")).digest("hex")}`,
  ].join("\n");
  await writeFile(path.join(reportDir, "RAPPORT_INVENTAIRES_ADMIN.md"), report, "utf8");
  await writeFile(
    path.join(process.cwd(), "docs/RAPPORT_INVENTAIRES_ADMIN.md"),
    report,
    "utf8"
  );
  log("OK rapport écrit");
  console.log("\nALL TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
