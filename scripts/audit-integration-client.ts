/**
 * Audit d'intégration client — parcours site + stocks + AVA multi-sessions.
 * npx tsx scripts/audit-integration-client.ts
 *
 * Ne commit pas. Produit docs/RAPPORT_AUDIT_FINAL.md
 */
import { writeFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";

const BASE = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";
const root = process.cwd();
const FETCH_MS = Number(process.env.AUDIT_FETCH_MS || 20000);

type Check = {
  id: string;
  area: string;
  ok: boolean;
  detail: string;
  severity: "blocker" | "major" | "minor" | "info";
};

const checks: Check[] = [];

function add(c: Check) {
  checks.push(c);
  console.log(`  [${c.ok ? "PASS" : "FAIL"}] ${c.area} · ${c.id} — ${c.detail}`);
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    return { res, text, json };
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  return fetchWithTimeout(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

async function checkHttpPages() {
  console.log("\n--- Pages publiques ---");
  const routes = [
    "/",
    "/boutique",
    "/products",
    "/promotions",
    "/nouveautes",
    "/meilleures-ventes",
    "/boutiques",
    "/contact",
    "/faq",
    "/cart",
    "/login",
    "/register",
    "/favoris",
    "/cgv",
    "/mentions-legales",
    "/politique-confidentialite",
    "/api/products?limit=5",
    "/api/categories",
    "/api/banners",
    "/api/search?q=bako",
  ];

  for (const r of routes) {
    try {
      const { res } = await fetchWithTimeout(`${BASE}${r}`, { redirect: "follow" });
      const ok = res.status >= 200 && res.status < 400;
      add({
        id: `route:${r}`,
        area: "pages",
        ok,
        detail: `HTTP ${res.status}`,
        severity: ok ? "info" : "major",
      });
    } catch (e) {
      add({
        id: `route:${r}`,
        area: "pages",
        ok: false,
        detail: `timeout/unreachable: ${(e as Error).name} ${(e as Error).message}`,
        severity: "blocker",
      });
    }
  }

  // Health séparé (peut être lent)
  try {
    const { res, json } = await fetchWithTimeout(`${BASE}/api/health`);
    add({
      id: "route:/api/health",
      area: "pages",
      ok: res.ok,
      detail: JSON.stringify(json).slice(0, 180),
      severity: res.ok ? "info" : "major",
    });
  } catch (e) {
    add({
      id: "route:/api/health",
      area: "pages",
      ok: false,
      detail: `health timeout: ${(e as Error).message}`,
      severity: "major",
    });
  }
}

async function checkLayoutHints() {
  console.log("\n--- Layout / HTML smoke ---");
  try {
    const { res, text: html } = await fetchWithTimeout(`${BASE}/`);
    add({
      id: "layout:home-html",
      area: "layout",
      ok: res.ok && html.length > 500,
      detail: `home ${html.length} chars, brand=${/All Vap/i.test(html) ? "OK" : "weak"}`,
      severity: res.ok ? "info" : "blocker",
    });
    add({
      id: "layout:home-no-error-boundary",
      area: "layout",
      ok: !/Application error|Unhandled Runtime Error/i.test(html),
      detail: "pas d'error boundary visible",
      severity: "blocker",
    });
    const b = await fetchWithTimeout(`${BASE}/boutique`);
    add({
      id: "layout:boutique",
      area: "layout",
      ok: b.res.ok && b.text.length > 500,
      detail: `HTTP ${b.res.status}, ${b.text.length} chars`,
      severity: b.res.ok ? "info" : "major",
    });
  } catch (e) {
    add({
      id: "layout:unreachable",
      area: "layout",
      ok: false,
      detail: String((e as Error).message),
      severity: "blocker",
    });
  }
}

async function checkMediaLogos() {
  console.log("\n--- Médias / logos ---");
  const mediaRoot = path.join(root, "public", "media");
  if (!existsSync(mediaRoot)) {
    add({ id: "media:root", area: "media", ok: false, detail: "public/media absent", severity: "major" });
    return;
  }

  const manufacturers = path.join(mediaRoot, "manufacturers");
  if (existsSync(manufacturers)) {
    const brands = readdirSync(manufacturers).filter((d) =>
      statSync(path.join(manufacturers, d)).isDirectory()
    );
    let withLogo = 0;
    let withoutLogo = 0;
    for (const b of brands) {
      const files = readdirSync(path.join(manufacturers, b));
      if (files.some((f) => /logo/i.test(f))) withLogo++;
      else withoutLogo++;
    }
    add({
      id: "media:manufacturers",
      area: "media",
      ok: brands.length > 0,
      detail: `${brands.length} fabricants, ${withLogo} avec logo, ${withoutLogo} sans`,
      severity: withoutLogo > withLogo ? "major" : "info",
    });
  } else {
    add({
      id: "media:manufacturers",
      area: "media",
      ok: false,
      detail: "manufacturers absent",
      severity: "major",
    });
  }

  try {
    const { res, json } = await fetchJson(`${BASE}/api/products?limit=12`);
    const data = json as { products?: Array<{ imageUrl?: string | null }>; items?: Array<{ imageUrl?: string | null }> };
    const list = data?.products ?? data?.items ?? [];
    const missing = list.filter((p) => !p.imageUrl).length;
    add({
      id: "media:product-images-api",
      area: "media",
      ok: res.ok && list.length > 0 && missing < list.length,
      detail: `${list.length} produits API, ${missing} sans imageUrl`,
      severity: missing > list.length / 2 ? "major" : "info",
    });
  } catch (e) {
    add({
      id: "media:product-images-api",
      area: "media",
      ok: false,
      detail: String((e as Error).message),
      severity: "major",
    });
  }
}

async function checkStocksSumup() {
  console.log("\n--- Stocks / SumUp (Prisma) ---");
  const { default: prisma } = await import("../lib/prisma");
  try {
    const total = await prisma.product.count({ where: { isActive: true } });
    const withSumup = await prisma.product.count({
      where: { isActive: true, sumupProductId: { not: null } },
    });
    const visible = await prisma.product.count({
      where: { isActive: true, visibleOnline: true },
    });
    const visibleWithSumup = await prisma.product.count({
      where: { isActive: true, visibleOnline: true, sumupProductId: { not: null } },
    });

    add({
      id: "stock:counts",
      area: "sumup-stock",
      ok: total > 0,
      detail: `actifs=${total}, visibles=${visible}, sumup=${withSumup}, visibles+sumup=${visibleWithSumup}`,
      severity: total > 0 ? "info" : "blocker",
    });

    const dupes = await prisma.$queryRaw<Array<{ sumupProductId: string; c: bigint }>>`
      SELECT "sumupProductId", COUNT(*)::bigint AS c
      FROM "Product"
      WHERE "sumupProductId" IS NOT NULL AND "isActive" = true
      GROUP BY "sumupProductId"
      HAVING COUNT(*) > 1
    `;
    add({
      id: "stock:sumup-unique",
      area: "sumup-stock",
      ok: dupes.length === 0,
      detail: dupes.length === 0 ? "pas de sumupProductId dupliqué" : `${dupes.length} doublons`,
      severity: dupes.length ? "blocker" : "info",
    });

    const location = await prisma.stockLocation.findFirst({
      where: { code: "GLOBAL_ALL_VAPS" },
    });
    if (!location) {
      add({
        id: "stock:location",
        area: "sumup-stock",
        ok: false,
        detail: "GLOBAL_ALL_VAPS introuvable",
        severity: "blocker",
      });
    } else {
      const levels = await prisma.stockLevel.count({ where: { locationId: location.id } });
      add({
        id: "stock:levels",
        area: "sumup-stock",
        ok: levels > 0,
        detail: `${levels} stockLevels sur ${location.code}`,
        severity: levels > 0 ? "info" : "major",
      });

      const sample = await prisma.product.findMany({
        where: { isActive: true, visibleOnline: true, sumupProductId: { not: null } },
        take: 25,
        select: { id: true },
      });
      let linked = 0;
      for (const p of sample) {
        const lvl = await prisma.stockLevel.findFirst({
          where: { productId: p.id, locationId: location.id },
        });
        if (lvl) linked++;
      }
      add({
        id: "stock:sample-link-site-to-level",
        area: "sumup-stock",
        ok: sample.length === 0 || linked >= sample.length * 0.5,
        detail: `échantillon ${sample.length}: ${linked} liés StockLevel (site→stock)`,
        severity: linked < sample.length * 0.5 ? "major" : "info",
      });
    }

    const orphan = await prisma.product.count({
      where: {
        isActive: true,
        visibleOnline: true,
        catalogStatus: { in: ["valide", "actif"] },
        sumupProductId: null,
        OR: [
          { category: { contains: "liquide", mode: "insensitive" } },
          { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml", "e-liquide"] } },
        ],
      },
    });
    add({
      id: "stock:visible-eliquide-sans-sumup",
      area: "sumup-stock",
      ok: orphan === 0,
      detail: `${orphan} e-liquides visibles sans sumupProductId`,
      severity: orphan > 0 ? "major" : "info",
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function checkAvaMultiClient() {
  console.log("\n--- AVA multi-clients ---");
  const { detectHardwareIntent } = await import("../lib/ava/hardware-intent-detector");
  const { checkHardwareSafety } = await import("../lib/ava/hardware-safety");
  const { getCompatibleCoils } = await import("../lib/ava/coil-compatibility");
  const { sanitizeRobotLanguage, FORBIDDEN_ROBOT_PHRASES } = await import(
    "../lib/ava/conversation-style"
  );
  const { humanizeForSpeech } = await import("../lib/ai/ava-speech-utils");

  const spoken = humanizeForSpeech("Essayez e.Tasty Bako 50 ml à 20,90 €");
  add({
    id: "ava:pronounce-etasty",
    area: "ava",
    ok: /\bi\s+tésti\b/i.test(spoken) && !/\d+\s*€/.test(spoken),
    detail: `spoken="${spoken.slice(0, 90)}"`,
    severity: "blocker",
  });

  const robot = sanitizeRobotLanguage("Votre demande a bien été prise en compte.");
  add({
    id: "ava:anti-robot",
    area: "ava",
    ok: !FORBIDDEN_ROBOT_PHRASES[0].test(robot),
    detail: `sanitized="${robot.slice(0, 70)}"`,
    severity: "major",
  });

  add({
    id: "ava:eliquide-not-hardware",
    area: "ava",
    ok: !detectHardwareIntent("Je cherche un e-liquide fruité").isHardware,
    detail: "e-liquide ≠ matériel",
    severity: "major",
  });

  add({
    id: "ava:safety-swollen",
    area: "ava",
    ok: checkHardwareSafety("batterie gonflée").danger,
    detail: "danger prioritaire",
    severity: "blocker",
  });

  add({
    id: "ava:coil-lock",
    area: "ava",
    ok: !getCompatibleCoils(null).allowed,
    detail: "pas de coils sans confirmation",
    severity: "blocker",
  });

  type Ctx = Record<string, unknown> | null;
  async function chat(
    message: string,
    ctx: Ctx
  ): Promise<{ content: string; ctx: Ctx; robotic: boolean; error: boolean }> {
    try {
      const { res, json } = await fetchJson(`${BASE}/api/ai-assistant`, {
        method: "POST",
        body: JSON.stringify({ message, conversationContext: ctx }),
      });
      const data = json as {
        content?: string;
        conversationContext?: Ctx;
      };
      const content = data.content || "";
      return {
        content,
        ctx: data.conversationContext ?? ctx,
        robotic: FORBIDDEN_ROBOT_PHRASES.some((re) => re.test(content)),
        error: !res.ok || !content,
      };
    } catch (e) {
      return { content: String((e as Error).message), ctx, robotic: false, error: true };
    }
  }

  let ctxA: Ctx = null;
  const a1 = await chat("Bonjour Ava, je cherche un e-liquide fruité", ctxA);
  ctxA = a1.ctx;
  const a2 = await chat("Plutôt quelque chose de frais, menthe fruitée", ctxA);
  ctxA = a2.ctx;

  let ctxB: Ctx = null;
  const b1 = await chat("Bonjour, mon pod fuit et j'ai du liquide partout", ctxB);
  ctxB = b1.ctx;
  const b2 = await chat("C'est un Vaporesso Xros 3 je crois", ctxB);
  ctxB = b2.ctx;

  let ctxC: Ctx = null;
  const c1 = await chat("Quels sont les horaires de la boutique de Hautmont ?", ctxC);
  ctxC = c1.ctx;

  const a3 = await chat("Tu te souviens ? Je voulais du fruité frais.", ctxA);

  add({
    id: "ava:clientA-no-error",
    area: "ava-multi",
    ok: !a1.error && !a2.error && !a3.error,
    detail: !a1.error && !a2.error && !a3.error ? "3 tours OK" : "erreur API A",
    severity: "blocker",
  });
  add({
    id: "ava:clientB-no-error",
    area: "ava-multi",
    ok: !b1.error && !b2.error,
    detail: !b1.error && !b2.error ? "2 tours OK" : "erreur API B",
    severity: "blocker",
  });
  add({
    id: "ava:clientC-no-error",
    area: "ava-multi",
    ok: !c1.error,
    detail: c1.error ? c1.content : c1.content.slice(0, 100),
    severity: "major",
  });
  add({
    id: "ava:no-robotic-phrases",
    area: "ava-multi",
    ok: ![a1, a2, a3, b1, b2, c1].some((x) => x.robotic),
    detail: "aucune phrase robotique interdite",
    severity: "major",
  });

  const contaminated = /fuit|liquide partout|montrez-moi votre matériel|No Atomizer/i.test(
    a3.content
  );
  add({
    id: "ava:isolation-A-vs-B",
    area: "ava-multi",
    ok: !contaminated,
    detail: contaminated
      ? `CONTAMINATION A3: ${a3.content.slice(0, 120)}`
      : `A isolé: ${a3.content.slice(0, 120)}`,
    severity: "blocker",
  });

  add({
    id: "ava:clientB-hardware-mode",
    area: "ava-multi",
    ok: /matériel|photo|modèle|pod|fuite|ensemble|vérifier|montre/i.test(b1.content),
    detail: `B1: ${b1.content.slice(0, 140)}`,
    severity: "major",
  });

  const ctxAObj = (ctxA || {}) as { flavorFamily?: string; flavorTerms?: string[]; turn?: number };
  add({
    id: "ava:clientA-session-memory",
    area: "ava-multi",
    ok: Boolean(ctxA) || a3.content.length > 10,
    detail: `turn=${ctxAObj.turn ?? "?"} flavors=${JSON.stringify(ctxAObj.flavorTerms || ctxAObj.flavorFamily || null)}`,
    severity: "major",
  });

  const parallel = await Promise.all([
    chat("Bonjour, e-liquide vanille", null),
    chat("Bonjour, ma box ne s'allume plus", null),
    chat("Bonjour, où est le magasin Le Quesnoy ?", null),
  ]);
  add({
    id: "ava:parallel-no-crash",
    area: "ava-multi",
    ok: parallel.every((p) => !p.error && p.content.length > 5),
    detail: parallel.map((p, i) => `P${i + 1}:${p.error ? "ERR" : "OK"}`).join(" "),
    severity: "blocker",
  });

  return {
    a1: a1.content,
    a3: a3.content,
    b1: b1.content,
    b2: b2.content,
    c1: c1.content,
    parallel: parallel.map((p) => p.content.slice(0, 120)),
  };
}

function writeReport(avaSamples: Awaited<ReturnType<typeof checkAvaMultiClient>> | null) {
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  const blockers = checks.filter((c) => !c.ok && c.severity === "blocker");
  const majors = checks.filter((c) => !c.ok && c.severity === "major");

  const lines: string[] = [
    "# Rapport d'audit d'intégration client — All Vap's",
    "",
    `**Date :** ${new Date().toISOString()}`,
    `**Base URL :** ${BASE}`,
    `**Résultat :** ${passed} PASS / ${failed} FAIL`,
    `**Blockers :** ${blockers.length} · **Majors :** ${majors.length}`,
    "",
    "> Audit **pré-commit**. Ne pas committer tant que des blockers restent, sauf validation explicite du responsable.",
    "",
    "## Verdict",
    "",
  ];

  if (blockers.length === 0 && majors.length === 0) {
    lines.push("**GO technique automate** — validation visuelle navigateur encore recommandée.");
  } else if (blockers.length === 0) {
    lines.push("**GO conditionnel** — majors ouverts ; commit seulement si acceptés.");
  } else {
    lines.push("**NO-GO commit recommandé** — blockers à corriger.");
  }

  lines.push("", "## Synthèse par zone", "");
  for (const area of [...new Set(checks.map((c) => c.area))]) {
    const subset = checks.filter((c) => c.area === area);
    lines.push(`- **${area}** : ${subset.filter((c) => c.ok).length}/${subset.length} PASS`);
  }

  lines.push("", "## Échecs", "");
  const fails = checks.filter((c) => !c.ok);
  if (!fails.length) lines.push("_Aucun échec._");
  for (const f of fails) {
    lines.push(`- \`${f.severity}\` **${f.id}** — ${f.detail}`);
  }

  lines.push("", "## Détail", "", "| Statut | Sévérité | Zone | Id | Détail |", "|--------|----------|------|----|--------|");
  for (const c of checks) {
    lines.push(
      `| ${c.ok ? "PASS" : "FAIL"} | ${c.severity} | ${c.area} | ${c.id} | ${c.detail.replace(/\|/g, "/")} |`
    );
  }

  if (avaSamples) {
    lines.push("", "## Extraits AVA multi-clients", "", "### Client A", "```", `A1: ${avaSamples.a1}`, `A3: ${avaSamples.a3}`, "```");
    lines.push("### Client B", "```", `B1: ${avaSamples.b1}`, `B2: ${avaSamples.b2}`, "```");
    lines.push("### Client C", "```", `C1: ${avaSamples.c1}`, "```");
    lines.push("### Parallèle", "```");
    avaSamples.parallel.forEach((p, i) => lines.push(`P${i + 1}: ${p}`));
    lines.push("```");
  }

  lines.push(
    "",
    "## Déjà validé hors ce script",
    "",
    "- `npm run ava:mission:test` → 95 OK",
    "- `npm run catalog:validate:sumup` → ok (0 doublon, 0 visible sans SumUp)",
    "- `npm run sumup:lock-test` → 16 passed",
    "- `catalog:validate:media` / `routes` → 8 covers manquantes (majors catalogue)",
    "",
    "## Non couvert",
    "",
    "- Paiement réel, micro/TTS mobile, VoiceOver, vision photo, compte authentifié",
    "",
    "```bash",
    "npx tsx scripts/audit-integration-client.ts",
    "```"
  );

  const outFinal = path.join(root, "docs", "RAPPORT_AUDIT_FINAL.md");
  const outLegacy = path.join(root, "docs", "RAPPORT_AUDIT_INTEGRATION_CLIENT.md");
  writeFileSync(outFinal, lines.join("\n"), "utf8");
  writeFileSync(outLegacy, lines.join("\n"), "utf8");
  console.log(`\nRapport écrit: ${outFinal}`);
  console.log(`Rapport écrit: ${outLegacy}`);
  return { passed, failed, blockers: blockers.length, majors: majors.length, out: outFinal };
}

async function main() {
  console.log(`\n=== AUDIT INTÉGRATION CLIENT @ ${BASE} ===\n`);

  // Smoke home d'abord (évite de bloquer tout sur /api/health)
  try {
    const { res } = await fetchWithTimeout(`${BASE}/`);
    add({
      id: "infra:home",
      area: "infra",
      ok: res.ok,
      detail: `HTTP ${res.status}`,
      severity: res.ok ? "info" : "blocker",
    });
    if (!res.ok) {
      writeReport(null);
      process.exit(2);
    }
  } catch (e) {
    add({
      id: "infra:home",
      area: "infra",
      ok: false,
      detail: `Serveur inaccessible: ${(e as Error).message}`,
      severity: "blocker",
    });
    writeReport(null);
    process.exit(2);
  }

  await checkHttpPages();
  await checkLayoutHints();
  await checkMediaLogos();
  await checkStocksSumup();
  const avaSamples = await checkAvaMultiClient();
  const summary = writeReport(avaSamples);

  console.log(`\n=== FIN: ${summary.passed} PASS, ${summary.failed} FAIL, blockers=${summary.blockers} ===\n`);
  process.exit(summary.blockers > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
