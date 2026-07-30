/**
 * Audit exhaustif chemins e-liquides → produit (critères stricts, sans faux positifs RSC).
 * Usage: npx tsx scripts/audit-eliquides-access-paths.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.AUDIT_BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

type Check = {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  finalUrl?: string;
  detail: string;
};

function isRealNotFoundPage(html: string): boolean {
  // Le bundle RSC contient parfois le texte du not-found.tsx même sur une page OK.
  // On exige le h1 visible de not-found SANS le nom produit dans un h1 de fiche.
  const hasNotFoundH1 =
    /font-display text-4xl text-white[^>]*>Produit introuvable</.test(html) ||
    /<h1[^>]*>\s*Produit introuvable\s*<\/h1>/i.test(html);
  const hasProductH1 = /font-display text-3xl[^>]*>[^<]{8,}/.test(html);
  return hasNotFoundH1 && !hasProductH1;
}

function isErrorPage(html: string): boolean {
  return (
    /Une erreur est survenue/.test(html) &&
    !/FRUIT DU DRAGON|Mamita|Ice Cool|EROTIC DREAM|Double Dragon/.test(html)
  );
}

async function fetchCheck(
  name: string,
  urlPath: string,
  expect: {
    status?: number | number[];
    mustInclude?: string[];
    mustNotIncludeNav?: boolean;
    mustBeProductPage?: boolean;
    mustRedirectToPrep?: boolean;
  } = {}
): Promise<Check> {
  const url = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "AllVapsAccessAudit/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(90000),
    });
    const text = await res.text();
    const finalUrl = res.url;
    const statuses = expect.status
      ? Array.isArray(expect.status)
        ? expect.status
        : [expect.status]
      : [200];
    const problems: string[] = [];

    if (!statuses.includes(res.status)) {
      problems.push(`status=${res.status}`);
    }
    if (isErrorPage(text)) problems.push("page erreur");
    if (isRealNotFoundPage(text)) problems.push("produit réellement introuvable");

    if (expect.mustBeProductPage) {
      if (!finalUrl.includes("/boutique/")) problems.push(`pas sur /boutique (final=${finalUrl})`);
      if (isRealNotFoundPage(text)) problems.push("fiche absente");
    }
    if (expect.mustRedirectToPrep && !finalUrl.includes("catalogue-en-preparation")) {
      problems.push(`attendu catalogue-en-preparation, final=${finalUrl}`);
    }
    if (expect.mustNotIncludeNav) {
      // Nav principale HTML (pas le footer texte)
      if (/>RÉSISTANCES</.test(text) || />E-CIGARETTES</.test(text) || />MARQUES</.test(text)) {
        problems.push("ancienne nav matériel présente");
      }
    }
    for (const s of expect.mustInclude || []) {
      if (!text.includes(s)) problems.push(`manque "${s}"`);
    }

    return {
      name,
      url: urlPath,
      ok: problems.length === 0,
      status: res.status,
      finalUrl,
      detail: problems.length ? problems.join(" ; ") : "OK",
    };
  } catch (e) {
    return {
      name,
      url: urlPath,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const samples = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
      OR: [
        { productFamily: { in: ["DOUBLE_DRAGON", "LE_FRUIT_DEFENDU", "MAMITA"] } },
        { manufacturer: { slug: "liquidarom" } },
      ],
    },
    select: {
      name: true,
      slug: true,
      productFamily: true,
      manufacturer: { select: { slug: true } },
      rangeRef: { select: { slug: true } },
    },
    take: 15,
    orderBy: { name: "asc" },
  });

  const checks: Check[] = [];

  checks.push(
    await fetchCheck("hub e-liquides", "/e-liquides", {
      mustInclude: ["E-liquides"],
      mustNotIncludeNav: true,
    })
  );
  checks.push(
    await fetchCheck("fabricant biarritz", "/fabricants/biarritz-lab", {
      mustInclude: ["Biarritz"],
      mustNotIncludeNav: true,
    })
  );
  checks.push(
    await fetchCheck("gamme double-dragon", "/gammes/double-dragon?fabricant=biarritz-lab", {
      mustInclude: ["Double Dragon", "Produits"],
      mustNotIncludeNav: true,
    })
  );
  checks.push(
    await fetchCheck("gamme fruit-defendu", "/gammes/le-fruit-defendu?fabricant=biarritz-lab", {
      mustInclude: ["Fruit"],
      mustNotIncludeNav: true,
    })
  );
  checks.push(
    await fetchCheck("gamme mamita", "/gammes/mamita?fabricant=biarritz-lab", {
      mustInclude: ["Mamita"],
      mustNotIncludeNav: true,
    })
  );

  for (const p of samples) {
    const token = p.name.slice(0, 18);
    checks.push(
      await fetchCheck(`PDP ${p.slug}`, `/boutique/${p.slug}`, {
        mustInclude: [token],
        mustBeProductPage: true,
        mustNotIncludeNav: true,
      })
    );
    checks.push(
      await fetchCheck(`alias products ${p.slug}`, `/products/${p.slug}`, {
        mustInclude: [token],
        mustBeProductPage: true,
        mustNotIncludeNav: true,
      })
    );
  }

  checks.push(
    await fetchCheck("resistances path", "/resistances", { mustRedirectToPrep: true })
  );
  checks.push(
    await fetchCheck("marques path", "/marques", { mustRedirectToPrep: true })
  );
  checks.push(
    await fetchCheck("boutique category resistances", "/boutique?category=resistances", {
      mustRedirectToPrep: true,
    })
  );

  const failed = checks.filter((c) => !c.ok);
  const passed = checks.filter((c) => c.ok);
  const dir = path.resolve("data/rebuild/RAPPORT_ACCES_ELIQUIDES");
  fs.mkdirSync(dir, { recursive: true });

  const report = {
    date: new Date().toISOString(),
    base: BASE,
    total: checks.length,
    passed: passed.length,
    failed: failed.length,
    successRate: `${Math.round((passed.length / checks.length) * 100)}%`,
    samples: samples.map((s) => s.slug),
    checks,
    failedChecks: failed,
  };
  fs.writeFileSync(path.join(dir, "audit-raw.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`PASS ${passed.length}/${checks.length} (${report.successRate})`);
  if (failed.length) {
    for (const f of failed) console.log(`FAIL ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("ALL OK");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
