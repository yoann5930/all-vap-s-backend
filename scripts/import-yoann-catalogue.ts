/**
 * Import catalogue Yoann (allvaps_catalogue.json).
 *
 * Défaut = DRY-RUN (aucune écriture).
 * --apply : crée/met à jour fabricants + propositions de gammes (NEEDS_CONFIRMATION).
 *           Ne publie PAS de gammes/produits en ligne.
 *           N’écrase JAMAIS le stock SumUp.
 *
 * Usage:
 *   npx tsx scripts/import-yoann-catalogue.ts
 *   npx tsx scripts/import-yoann-catalogue.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { normalizeForMatch } from "../lib/catalog/official-verification";

type JsonProduct = {
  name: string;
  format_ml?: number;
  formats_ml?: number[];
  flavor?: string;
};

type JsonRange = {
  name: string;
  aliases?: string[];
  products?: JsonProduct[];
};

type JsonManufacturer = {
  id: string;
  name: string;
  aliases?: string[];
  ranges?: JsonRange[];
  standalone_products?: JsonProduct[];
};

type CatalogueFile = {
  schema_version: string;
  status: string;
  manufacturers: JsonManufacturer[];
  pending_verification?: string[];
};

type Report = {
  mode: "dry-run" | "apply";
  source: string;
  generatedAt: string;
  validation: { ok: boolean; errors: string[]; warnings: string[] };
  manufacturers: {
    matched: number;
    wouldCreate: number;
    wouldUpdate: number;
    details: Array<Record<string, unknown>>;
  };
  ranges: {
    matched: number;
    wouldPropose: number;
    emptyProducts: number;
    withProducts: number;
    details: Array<Record<string, unknown>>;
  };
  products: {
    listed: number;
    matchedExisting: number;
    wouldCreateDraft: number;
    skippedEmpty: number;
    details: Array<Record<string, unknown>>;
  };
  pending_verification: string[];
  conflicts: string[];
  stockSumUpTouched: false;
};

function formatsOf(p: JsonProduct): number[] {
  if (Array.isArray(p.formats_ml) && p.formats_ml.length) return p.formats_ml;
  if (typeof p.format_ml === "number") return [p.format_ml];
  return [];
}

async function findManufacturer(m: JsonManufacturer) {
  const names = [m.name, m.id, ...(m.aliases || [])].map(normalizeForMatch);
  const all = await prisma.manufacturer.findMany({
    select: { id: true, name: true, slug: true, status: true },
  });
  return (
    all.find((x) => {
      const n = normalizeForMatch(x.name);
      const s = normalizeForMatch(x.slug);
      return names.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

async function findRange(manufacturerId: string, rangeName: string, aliases?: string[]) {
  const keys = [rangeName, ...(aliases || [])].map(normalizeForMatch);
  const ranges = await prisma.productRange.findMany({
    where: { manufacturerId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  });
  return (
    ranges.find((r) => {
      const n = normalizeForMatch(r.name);
      const s = normalizeForMatch(r.slug);
      return keys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

async function findProduct(params: {
  name: string;
  manufacturerId?: string | null;
  rangeId?: string | null;
  formatMl?: number | null;
}) {
  const key = normalizeForMatch(params.name);
  const or: Array<Record<string, unknown>> = [
    {
      name: { contains: params.name.split(/\s+/)[0] || params.name, mode: "insensitive" },
    },
  ];
  if (params.rangeId) or.unshift({ rangeId: params.rangeId });
  if (params.manufacturerId) or.unshift({ manufacturerId: params.manufacturerId });

  const candidates = await prisma.product.findMany({
    where: { OR: or as never },
    select: {
      id: true,
      name: true,
      slug: true,
      productType: true,
      volumeMl: true,
      manufacturerId: true,
      rangeId: true,
      stock: true,
      sumupProductId: true,
      visibleOnline: true,
    },
    take: 80,
  });
  return (
    candidates.find((p) => {
      const n = normalizeForMatch(p.name);
      const nameOk = n === key || n.includes(key) || key.includes(n);
      if (!nameOk) return false;
      if (params.formatMl != null) {
        const ml =
          p.volumeMl ??
          (typeof p.productType === "string"
            ? Number(String(p.productType).replace(/[^\d]/g, ""))
            : null);
        if (ml != null && Number.isFinite(ml) && ml !== params.formatMl) return false;
      }
      return true;
    }) || null
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const source = path.resolve("data/catalog/yoann/allvaps_catalogue.json");
  const raw = JSON.parse(fs.readFileSync(source, "utf8")) as CatalogueFile;

  const report: Report = {
    mode: apply ? "apply" : "dry-run",
    source,
    generatedAt: new Date().toISOString(),
    validation: { ok: true, errors: [], warnings: [] },
    manufacturers: { matched: 0, wouldCreate: 0, wouldUpdate: 0, details: [] },
    ranges: {
      matched: 0,
      wouldPropose: 0,
      emptyProducts: 0,
      withProducts: 0,
      details: [],
    },
    products: {
      listed: 0,
      matchedExisting: 0,
      wouldCreateDraft: 0,
      skippedEmpty: 0,
      details: [],
    },
    pending_verification: raw.pending_verification || [],
    conflicts: [],
    stockSumUpTouched: false,
  };

  if (!raw.manufacturers?.length) {
    report.validation.ok = false;
    report.validation.errors.push("Aucun fabricant dans le JSON");
  }
  if (raw.status !== "draft_audited" && raw.status !== "audited") {
    report.validation.warnings.push(`status JSON = ${raw.status} (base de travail, non exhaustive)`);
  }

  for (const m of raw.manufacturers || []) {
    const existing = await findManufacturer(m);
    let manufacturerId = existing?.id || null;
    const action = existing ? "match" : "create";

    if (existing) {
      report.manufacturers.matched++;
      report.manufacturers.wouldUpdate++;
    } else {
      report.manufacturers.wouldCreate++;
    }

    report.manufacturers.details.push({
      jsonId: m.id,
      name: m.name,
      aliases: m.aliases || [],
      action,
      existingSlug: existing?.slug || null,
    });

    if (apply && !existing) {
      const slugBase = slugify(m.id || m.name) || `mfr-${Date.now()}`;
      let slug = slugBase;
      let i = 1;
      while (await prisma.manufacturer.findUnique({ where: { slug } })) {
        slug = `${slugBase}-${i++}`;
      }
      const created = await prisma.manufacturer.create({
        data: {
          name: m.name,
          slug,
          status: "a_verifier",
          isActive: true,
        },
      });
      manufacturerId = created.id;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Manufacturer" SET "verificationStatus" = 'NEEDS_CONFIRMATION', "verificationEvidence" = $1 WHERE id = $2`,
          JSON.stringify({
            source: "yoann_catalogue_json",
            aliases: m.aliases || [],
            note: "Créé depuis liste Yoann — site officiel + logo à vérifier avant publication.",
          }),
          created.id
        );
      } catch {
        /* ignore */
      }
    }

    if (apply && existing && (m.aliases?.length || 0) > 0) {
      // Enrichir evidence sans toucher stock (SQL défensif si client Prisma pas à jour)
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Manufacturer" SET "verificationEvidence" = $1 WHERE id = $2`,
          JSON.stringify({
            source: "yoann_catalogue_json",
            aliases: m.aliases,
            note: "Alias enrichis — pas de publication auto.",
          }),
          existing.id
        );
      } catch {
        /* champ absent = ignore */
      }
    }

    // Brand stub for future range create (apply only, still not catalogVisible)
    let brandId: string | null = null;
    if (apply && manufacturerId) {
      const brand = await prisma.brand.findFirst({
        where: { manufacturerId },
        orderBy: { createdAt: "asc" },
      });
      if (brand) brandId = brand.id;
      else {
        const bslug = `${slugify(m.name)}-brand`;
        const createdBrand = await prisma.brand.create({
          data: {
            name: m.name,
            slug: bslug + "-" + manufacturerId.slice(-4),
            manufacturerId,
            status: "a_verifier",
          },
        });
        brandId = createdBrand.id;
      }
    }

    for (const r of m.ranges || []) {
      const productCount = r.products?.length || 0;
      if (productCount === 0) {
        report.ranges.emptyProducts++;
        report.products.skippedEmpty++;
      } else {
        report.ranges.withProducts++;
      }

      const existingRange =
        manufacturerId != null
          ? await findRange(manufacturerId, r.name, r.aliases)
          : null;

      if (existingRange) {
        report.ranges.matched++;
        report.ranges.details.push({
          manufacturer: m.name,
          range: r.name,
          action: "match_existing",
          rangeId: existingRange.id,
          productCount,
          note: "Gamme déjà en base — pas de republication auto",
        });
      } else {
        report.ranges.wouldPropose++;
        report.ranges.details.push({
          manufacturer: m.name,
          range: r.name,
          action: "propose_only",
          productCount,
          note:
            productCount === 0
              ? "products vide — compléter catalogue officiel avant intégration"
              : "Proposition Yoann — vérification site officiel obligatoire",
        });

        if (apply && manufacturerId) {
          // CatalogRangeProposal via SQL si le client Prisma n'est pas régénéré
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "CatalogRangeProposal" (id, "manufacturerId", "proposedName", "proposedBy", "verificationStatus", notes, "evidenceJson", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, 'yoann', 'NEEDS_CONFIRMATION', $4, $5, NOW(), NOW())`,
              `crp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              manufacturerId,
              r.name,
              `Liste Yoann ${m.name}. products=${productCount}. Pas d’intégration auto.`,
              JSON.stringify({
                aliases: r.aliases || [],
                productsListed: (r.products || []).map((p) => ({
                  name: p.name,
                  formats: formatsOf(p),
                  flavor: p.flavor || null,
                })),
                source: "allvaps_catalogue.json",
              })
            );
          } catch (e) {
            report.conflicts.push(
              `Proposition non écrite (${m.name} / ${r.name}): ${e instanceof Error ? e.message : e}`
            );
          }
          void brandId;
        }
      }

      for (const p of r.products || []) {
        const formats = formatsOf(p);
        const formatList = formats.length ? formats : [null];
        for (const ml of formatList) {
          report.products.listed++;
          const existingProduct = await findProduct({
            name: p.name,
            manufacturerId,
            rangeId: existingRange?.id || null,
            formatMl: ml,
          });
          if (existingProduct) {
            report.products.matchedExisting++;
            if (existingProduct.sumupProductId) {
              // Jamais toucher stock
            }
            report.products.details.push({
              action: "match_existing",
              manufacturer: m.name,
              range: r.name,
              product: p.name,
              format_ml: ml,
              productId: existingProduct.id,
              sumupLinked: Boolean(existingProduct.sumupProductId),
              stockUntouched: true,
            });
          } else {
            report.products.wouldCreateDraft++;
            report.products.details.push({
              action: "draft_only_not_created",
              manufacturer: m.name,
              range: r.name,
              product: p.name,
              format_ml: ml,
              flavor: p.flavor || null,
              note:
                "Produit listé par Yoann mais non créé automatiquement — attendre preuve officielle + SumUp.",
            });
            // Intentionnel : --apply ne crée PAS les produits inventés / non prouvés
          }
        }
      }
    }

    for (const sp of m.standalone_products || []) {
      report.products.listed++;
      report.validation.warnings.push(
        `Produit hors gamme chez ${m.name}: ${sp.name} — à classer après vérification officielle`
      );
      report.products.details.push({
        action: "standalone_pending",
        manufacturer: m.name,
        product: sp.name,
      });
    }
  }

  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(outDir, `IMPORT_DRYRUN_${stamp}.json`);
  const mdPath = path.join(outDir, `RAPPORT_IMPORT_YOANN_${stamp}.md`);

  // Compact details in MD
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = `# Rapport import catalogue Yoann — ${stamp}

Mode : **${report.mode}**  
Source : \`data/catalog/yoann/allvaps_catalogue.json\`  
Généré : ${report.generatedAt}

## Validation

- OK : ${report.validation.ok}
- Erreurs : ${report.validation.errors.length ? report.validation.errors.join(" ; ") : "aucune"}
- Avertissements : ${report.validation.warnings.length}

${report.validation.warnings.map((w) => `- ${w}`).join("\n")}

## Synthèse

| Élément | Match existant | À créer / proposer |
|--------|----------------|--------------------|
| Fabricants | ${report.manufacturers.matched} | ${report.manufacturers.wouldCreate} |
| Gammes | ${report.ranges.matched} | ${report.ranges.wouldPropose} (propositions) |
| Produits listés | ${report.products.matchedExisting} matchés | ${report.products.wouldCreateDraft} non créés (attente preuve) |

- Gammes avec \`products\` vide : **${report.ranges.emptyProducts}**
- Gammes avec produits listés : **${report.ranges.withProducts}**
- Stock SumUp touché : **non** (\`stockSumUpTouched: false\`)

## Règles respectées

1. Pas d’écrasement stock SumUp
2. Pas d’invention / publication auto
3. Liste Yoann = base de recherche → \`CatalogRangeProposal\` / \`NEEDS_CONFIRMATION\`
4. Gammes \`products: []\` non présentées comme exhaustives
5. \`pending_verification\` conservé

## pending_verification (JSON)

${(report.pending_verification || []).map((x) => `- ${x}`).join("\n")}

## Prochaines étapes

1. Relire ce rapport
2. Si OK : \`npx tsx scripts/import-yoann-catalogue.ts --apply\` (fabricants + propositions seulement)
3. Vérifier chaque gamme proposée sur site officiel : \`npm run catalog:verify-ranges -- …\`
4. Logos fabricants
5. Comparaison CSV SumUp avant publication produits

## Détail JSON

Voir \`${path.basename(jsonPath)}\`
`;

  fs.writeFileSync(mdPath, md);
  console.log(md);
  console.log("\nJSON:", jsonPath);
  console.log("MD:", mdPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
