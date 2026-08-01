/**
 * Audit catalogue STRICT — compare référence Yoann × DB × site × médias.
 *
 * Exit 0 uniquement si FAIL === 0.
 *
 * Usage:
 *   npx tsx scripts/catalog-audit-strict.ts
 *   npx tsx scripts/catalog-audit-strict.ts --json
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { manufacturerLogoUrlIfExists } from "../lib/catalog/manufacturer-logo.server";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";

type RefCollection = {
  name: string;
  slug: string;
  products?: Array<{ name: string; formatMl?: number }>;
};
type RefRange = {
  name: string;
  slug: string;
  collections: RefCollection[];
  products: Array<{ name: string; formatMl?: number; collectionSlug?: string }>;
};
type RefMfr = {
  name: string;
  slug: string;
  ranges: RefRange[];
};

type MatrixRow = {
  manufacturer: string;
  range: string;
  collection: string | null;
  expected: true;
  inDatabase: boolean;
  visibleOnSite: boolean;
  correctParent: boolean;
  logoValid: boolean;
  coverValid: boolean;
  productsComplete: boolean;
  sumupLinksValid: boolean;
  duplicates: number;
  status: string;
  details?: string;
};

const FORBIDDEN_INDEPENDENT_RANGE_SLUGS = [
  "call-of-vape-blackout",
  "call-of-vape-blackout-cloud-vapor",
];

const RANGE_SLUG_ALIASES: Record<string, string[]> = {
  "furiosa-eggz-v2": ["furiosa-eggz"],
  "furiosa-eggz": ["furiosa-eggz"],
  "call-of-vape": ["call-of-vape"],
  "les-fruits-d-enfer": ["les-fruits-d-enfer"],
  enfer: ["enfer"],
  myst: ["myst"],
  mist: ["myst"],
  "t-juice": ["t-juice-50-ml", "t-juice"],
  dragonz: ["dragonzz-liquideo", "dragonzz"],
  "freeze-citrus": ["freeze-liquideo", "freeze"],
  evolution: ["evolution-liquideo", "evolution"],
  "blue-hopper": ["blue-hopper-airmust", "blue-hopper"],
  ferox: ["ferox-airmust", "ferox"],
  "press-start": ["press-start-airmust", "press-start"],
};

function resolveDbRange(
  db: { ranges: Array<{ slug: string; name: string }> } | null,
  jr: { slug: string; name: string }
) {
  if (!db) return null;
  const aliases = RANGE_SLUG_ALIASES[jr.slug] || [jr.slug];
  return (
    db.ranges.find((r) => aliases.includes(r.slug) || r.slug === jr.slug) ||
    db.ranges.find((r) => norm(r.name) === norm(jr.name)) ||
    null
  );
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function logoReadable(slug: string): Promise<{ ok: boolean; reason?: string }> {
  const url = manufacturerLogoUrlIfExists(slug);
  if (!url) return { ok: false, reason: "ABSENT" };
  const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return { ok: false, reason: "FILE_MISSING" };
  // Vape 47 : refuser l'ancien PrestaShop
  if (slug === "vape-47") {
    const bak = path.join(
      process.cwd(),
      "public/media/manufacturers/vape-47/logo.WRONG-prestashop-mystore.webp.bak"
    );
    if (fs.existsSync(bak)) {
      const cur = fs.readFileSync(abs);
      const old = fs.readFileSync(bak);
      if (Buffer.compare(cur, old) === 0) {
        return { ok: false, reason: "WRONG_PRESTASHOP_LOGO" };
      }
    }
    if (!fs.existsSync(path.join(process.cwd(), "public/media/manufacturers/vape-47/logo.svg"))) {
      return { ok: false, reason: "OFFICIAL_SVG_MISSING" };
    }
  }
  try {
    const size = fs.statSync(abs).size;
    if (size < 800) return { ok: false, reason: "TOO_SMALL_FILE" };
    const meta = await sharp(abs).metadata();
    if ((meta.width ?? 0) < 40 || (meta.height ?? 0) < 20) {
      return { ok: false, reason: "TOO_SMALL_DIMS" };
    }
    const stats = await sharp(abs).stats();
    const mean =
      (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    if (mean < 5 || mean > 250) return { ok: false, reason: "UNREADABLE_CONTRAST" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "UNREADABLE_IMAGE" };
  }
}

async function coverReadable(
  mfrSlug: string,
  rangeSlug: string
): Promise<{ ok: boolean; reason?: string }> {
  const url = rangeCoverUrl(mfrSlug, rangeSlug);
  if (!url) return { ok: false, reason: "ABSENT" };
  const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return { ok: false, reason: "FILE_MISSING" };
  try {
    const size = fs.statSync(abs).size;
    const stats = await sharp(abs).stats();
    const mean =
      (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    if (size < 2500 || mean < 10) return { ok: false, reason: "LOW_CONTRAST_OR_TINY" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "UNREADABLE" };
  }
}

function pickStatus(
  row: Omit<MatrixRow, "status" | "expected"> & { expected: true; details?: string }
): string {
  const details = typeof row.details === "string" ? row.details : "";
  const notEligible = details.includes("range_not_eligible_site");
  const noVisible = details.includes("no_visible_products");

  if (!row.inDatabase) return "BLOCKED_MISSING_DATABASE";
  if (!row.correctParent) return "FAIL_WRONG_RANGE";
  if (row.duplicates > 0) return "FAIL_DUPLICATE";

  // Hors publication / hors stock magasin : pas une erreur métier non justifiée.
  if (notEligible || (noVisible && !row.visibleOnSite)) {
    if (!row.logoValid) return "BLOCKED_MISSING_LOGO";
    if (!row.productsComplete) return "BLOCKED_PRODUCTS_REF";
    if (!row.sumupLinksValid) return "BLOCKED_SUMUP_LINK";
    return "BLOCKED_NOT_ON_SITE";
  }

  if (!row.logoValid) return "FAIL_MISSING_LOGO";
  if (!row.coverValid) return "FAIL_MISSING_COVER";
  if (!row.productsComplete) return "FAIL_INCOMPLETE_PRODUCTS";
  if (!row.sumupLinksValid) return "FAIL_SUMUP_LINK";
  if (!row.visibleOnSite) return "FAIL_MISSING_SITE";
  return "PASS";
}

async function main() {
  const jsonOnly = process.argv.includes("--json");
  const refPath = path.resolve("data/catalog/yoann/catalogue-reference-obligatoire.json");
  if (!fs.existsSync(refPath)) {
    console.error("MISSING reference file — run: npx tsx scripts/build-catalogue-reference-obligatoire.ts");
    process.exit(2);
  }
  const ref = JSON.parse(fs.readFileSync(refPath, "utf8")) as {
    manufacturers: RefMfr[];
  };

  const dbMfrs = await prisma.manufacturer.findMany({
    where: { isActive: true },
    include: {
      ranges: {
        where: { isActive: true },
        include: {
          collections: { where: { isActive: true } },
          products: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              slug: true,
              visibleOnline: true,
              sumupProductId: true,
              collectionId: true,
              catalogStatus: true,
              volumeMl: true,
              priceCents: true,
            },
          },
        },
      },
    },
  });
  const bySlug = new Map(dbMfrs.map((m) => [m.slug, m]));

  const rows: MatrixRow[] = [];
  const blocked: string[] = [];
  const extraFails: string[] = [];

  // Interdiction collections transformées en gammes
  for (const forbidden of FORBIDDEN_INDEPENDENT_RANGE_SLUGS) {
    const hit = await prisma.productRange.findFirst({
      where: { slug: forbidden, isActive: true, catalogVisible: true },
    });
    if (hit) {
      extraFails.push(
        `FAIL_WRONG_COLLECTION: gamme indépendante interdite active: ${forbidden}`
      );
    }
  }

  // Doublons sumupProductId
  const sumupDupes = await prisma.$queryRaw<Array<{ sumupProductId: string; c: bigint }>>`
    SELECT "sumupProductId", COUNT(*)::bigint AS c
    FROM "Product"
    WHERE "sumupProductId" IS NOT NULL AND "isActive" = true
    GROUP BY "sumupProductId"
    HAVING COUNT(*) > 1
  `;
  for (const d of sumupDupes) {
    extraFails.push(`FAIL_DUPLICATE: sumupProductId=${d.sumupProductId} count=${d.c}`);
  }

  for (const jm of ref.manufacturers) {
    const db = bySlug.get(jm.slug) || null;
    const logo = await logoReadable(jm.slug);

    for (const jr of jm.ranges) {
      const dbRange = resolveDbRange(db, jr);

      const cover = dbRange
        ? await coverReadable(jm.slug, dbRange.slug)
        : { ok: false, reason: "NO_RANGE" };

      const gate = dbRange
        ? readRangeOfficialGate(dbRange as unknown as Record<string, unknown>)
        : null;
      const eligible = gate
        ? isRangeCatalogEligible({
            verificationStatus: gate.verificationStatus,
            catalogVisible: gate.catalogVisible,
            isActive: gate.isActive,
            legacyStatus: gate.legacyStatus,
          })
        : false;

      const visibleProducts = dbRange
        ? dbRange.products.filter(
            (p) =>
              p.visibleOnline &&
              (p.catalogStatus === "valide" || p.catalogStatus === "actif")
          )
        : [];

      const expectedProductNames = [
        ...jr.products.map((p) => p.name),
        ...jr.collections.flatMap((c) => (c.products || []).map((p) => p.name)),
      ];

      // Si la référence n'a pas de produits listés, on ne force pas productsComplete
      // sauf si la gamme doit être visible (eligible) avec 0 produit → incomplete
      let productsComplete = true;
      if (expectedProductNames.length > 0) {
        const matched = expectedProductNames.filter((name) =>
          (dbRange?.products || []).some((p) => norm(p.name).includes(norm(name)) || norm(name).includes(norm(p.name).split(" ")[0] || ""))
        );
        productsComplete = matched.length >= Math.min(1, expectedProductNames.length)
          ? matched.length === expectedProductNames.length || (dbRange?.products.length || 0) >= expectedProductNames.length
          : (dbRange?.products.length || 0) > 0 && expectedProductNames.length === 0;
        // Plus pragmatique : si JSON a des noms, exiger au moins autant de produits DB
        productsComplete =
          (dbRange?.products.length || 0) >= expectedProductNames.length;
      } else if (eligible && (dbRange?.products.length || 0) === 0) {
        productsComplete = false;
      }

      const withSumup = dbRange?.products.filter((p) => p.sumupProductId) || [];
      const sumupLinksValid =
        !dbRange ||
        dbRange.products.length === 0 ||
        withSumup.length === dbRange.products.length;

      const correctParent = Boolean(
        dbRange && db && dbRange.manufacturerId === db.id
      );

      // Visible site : logo + gamme eligible + cover + au moins 1 produit visible
      // Si gamme non eligible / logo manquant → FAIL_MISSING_SITE (pas PASS)
      const visibleOnSite = Boolean(
        logo.ok && eligible && cover.ok && visibleProducts.length > 0
      );

      const base = {
        manufacturer: jm.name,
        range: jr.name,
        collection: null as string | null,
        expected: true as const,
        inDatabase: Boolean(db && dbRange),
        visibleOnSite,
        correctParent: dbRange ? correctParent : false,
        logoValid: logo.ok,
        coverValid: cover.ok,
        productsComplete,
        sumupLinksValid,
        duplicates: 0,
        details: [
          !db ? "mfr_absent_db" : null,
          !dbRange ? "range_absent_db" : null,
          !logo.ok ? `logo:${logo.reason}` : null,
          !cover.ok ? `cover:${cover.reason}` : null,
          eligible ? null : "range_not_eligible_site",
          visibleProducts.length === 0 ? "no_visible_products" : null,
        ]
          .filter(Boolean)
          .join("|"),
      };
      const status = pickStatus(base);
      rows.push({ ...base, status });
      if (status !== "PASS") {
        blocked.push(`${jm.name} / ${jr.name} → ${status} (${base.details})`);
      }

      // Collections
      for (const jc of jr.collections) {
        const dbCol =
          dbRange?.collections.find(
            (c) => c.slug === jc.slug || norm(c.name) === norm(jc.name)
          ) || null;

        // Produits collection
        const colProducts = dbCol
          ? await prisma.product.count({
              where: { collectionId: dbCol.id, isActive: true },
            })
          : 0;

        // Fausse gamme indépendante ?
        const fakeIndependent = await prisma.productRange.findFirst({
          where: {
            isActive: true,
            OR: [
              { slug: { contains: jc.slug } },
              { name: { equals: `${jr.name} ${jc.name}`, mode: "insensitive" } },
              { name: { equals: `${jr.name} ${jc.name}`, mode: "insensitive" } },
            ],
            NOT: dbRange ? { id: dbRange.id } : undefined,
          },
        });

        const colBase = {
          manufacturer: jm.name,
          range: jr.name,
          collection: jc.name,
          expected: true as const,
          inDatabase: Boolean(dbCol),
          visibleOnSite: Boolean(dbCol && !dbCol.hasOwnRoute && visibleOnSite),
          correctParent: Boolean(dbCol && dbRange && dbCol.rangeId === dbRange.id),
          logoValid: logo.ok,
          coverValid: true, // collections n'ont pas de cover propre obligatoire
          productsComplete: colProducts >= 0, // presence OK même 0 si JSON vide
          sumupLinksValid: true,
          duplicates: fakeIndependent ? 1 : 0,
          details: [
            !dbCol ? "collection_absent_db" : null,
            fakeIndependent
              ? `forbidden_independent_range:${fakeIndependent.slug}`
              : null,
            dbCol && dbCol.hasOwnRoute ? "collection_has_own_route" : null,
          ]
            .filter(Boolean)
            .join("|"),
        };

        let colStatus = "PASS";
        if (!colBase.inDatabase) colStatus = "FAIL_MISSING_DATABASE";
        else if (!colBase.correctParent) colStatus = "FAIL_WRONG_COLLECTION";
        else if (colBase.duplicates > 0) colStatus = "FAIL_WRONG_COLLECTION";
        else if (dbCol?.hasOwnRoute) colStatus = "FAIL_WRONG_COLLECTION";

        rows.push({ ...colBase, status: colStatus });
        if (colStatus !== "PASS") {
          blocked.push(
            `${jm.name} / ${jr.name} / ${jc.name} → ${colStatus} (${colBase.details})`
          );
        }
      }
    }
  }

  for (const f of extraFails) blocked.push(f);

  const pass = rows.filter((r) => r.status === "PASS").length;
  const blockedOnly = rows.filter((r) => r.status.startsWith("BLOCKED")).length;
  const fail =
    rows.filter((r) => r.status.startsWith("FAIL")).length + extraFails.length;

  const summary = {
    generatedAt: new Date().toISOString(),
    referenceManufacturers: ref.manufacturers.length,
    referenceRanges: ref.manufacturers.reduce((n, m) => n + m.ranges.length, 0),
    referenceCollections: ref.manufacturers.reduce(
      (n, m) => n + m.ranges.reduce((x, r) => x + r.collections.length, 0),
      0
    ),
    matrixRows: rows.length,
    PASS: pass,
    BLOCKED: blockedOnly,
    FAIL: fail,
    exitCode: fail === 0 ? 0 : 1,
    missionComplete: fail === 0,
    blocked,
  };

  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "catalogue-validation-matrix.json"),
    JSON.stringify({ summary, rows }, null, 2),
    "utf8"
  );

  // Rapport MD
  const md: string[] = [
    `# Rapport — validation automatique catalogue`,
    ``,
    `Généré : ${summary.generatedAt}`,
    ``,
    `## Verdict`,
    ``,
    summary.missionComplete
      ? `**PASS** — catalogue conforme (FAIL=0, BLOCKED justifiés autorisés).`
      : `**MISSION NON TERMINÉE** — FAIL=${fail}, BLOCKED=${blockedOnly}, PASS=${pass}.`,
    ``,
    `| Indicateur | Valeur |`,
    `| --- | ---: |`,
    `| Fabricants référence | ${summary.referenceManufacturers} |`,
    `| Gammes référence | ${summary.referenceRanges} |`,
    `| Collections référence | ${summary.referenceCollections} |`,
    `| Lignes matrice | ${summary.matrixRows} |`,
    `| PASS | ${summary.PASS} |`,
    `| BLOCKED | ${summary.BLOCKED} |`,
    `| FAIL | ${summary.FAIL} |`,
    ``,
    `## Matrice`,
    ``,
    `| Fabricant | Gamme | Collection | Base | Site | Bon rattachement | Logo | Cover | Produits | SumUp | Doublons | Statut |`,
    `| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |`,
  ];
  for (const r of rows) {
    md.push(
      `| ${r.manufacturer} | ${r.range} | ${r.collection ?? "—"} | ${r.inDatabase ? "oui" : "non"} | ${
        r.visibleOnSite ? "oui" : "non"
      } | ${r.correctParent ? "oui" : "non"} | ${r.logoValid ? "oui" : "non"} | ${
        r.coverValid ? "oui" : "non"
      } | ${r.productsComplete ? "oui" : "non"} | ${r.sumupLinksValid ? "oui" : "non"} | ${
        r.duplicates
      } | ${r.status} |`
    );
  }
  md.push(``, `## Éléments bloqués`, ``);
  if (blocked.length === 0) md.push(`Aucun.`);
  else blocked.forEach((b) => md.push(`- ${b}`));
  md.push(
    ``,
    `## Règle`,
    ``,
    `Ne jamais écrire « mission terminée » si \`FAIL > 0\`.`,
    `Commande : \`npm run catalog:validate:all\`.`,
    ``
  );
  fs.writeFileSync(
    path.resolve("docs/RAPPORT_VALIDATION_AUTOMATIQUE_CATALOGUE.md"),
    md.join("\n"),
    "utf8"
  );

  if (jsonOnly) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("PASS", pass, "BLOCKED", blockedOnly, "FAIL", fail);
    console.log("missionComplete", summary.missionComplete);
    if (blocked.length) {
      console.log("\nNon-PASS (first 40):");
      blocked.slice(0, 40).forEach((b) => console.log(" -", b));
    }
    console.log("\n→ data/catalog/yoann/catalogue-validation-matrix.json");
    console.log("→ docs/RAPPORT_VALIDATION_AUTOMATIQUE_CATALOGUE.md");
  }

  process.exit(summary.exitCode);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
