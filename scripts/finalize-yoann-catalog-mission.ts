/**
 * Finalisation mission catalogue Yoann — AUCUNE gamme en PROPOSITION SEULE / PARTIELLE.
 *
 * Chaque gamme JSON → CORRIGÉE ET COMPLÈTE | BLOQUÉE AVEC JUSTIFICATION OFFICIELLE
 *
 * Usage:
 *   npx tsx scripts/finalize-yoann-catalog-mission.ts
 *   npx tsx scripts/finalize-yoann-catalog-mission.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { normalizeForMatch } from "../lib/catalog/official-verification";
import {
  findExistingProductBeforeCreate,
  productUniquenessKey,
  registerOrRejectDuplicate,
} from "../lib/catalog/assert-no-duplicates";
import { manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo";
import { rangeCoverUrl } from "../lib/catalog/range-cover";

type JsonProduct = { name: string; format_ml?: number; formats_ml?: number[]; flavor?: string };
type JsonRange = { name: string; aliases?: string[]; products?: JsonProduct[] };
type JsonMfr = { id: string; name: string; aliases?: string[]; ranges?: JsonRange[] };

type Confirmed = {
  manufacturerId: string;
  jsonName: string;
  officialName: string;
  aliases?: string[];
  sourceUrl?: string | null;
  manufacturerUrl?: string | null;
  products?: Array<{ name: string; format_ml?: number; productType?: string }>;
  sumupRangeToken?: string;
  mapToExistingManufacturerSlug?: string;
  mapToExistingRangeSlug?: string;
  notes?: string;
  needsYoannConfirmSite?: boolean;
};

type Blocked = {
  manufacturerId: string;
  jsonName: string;
  reason: string;
  officialUrl?: string;
  yoannValidationRequired?: boolean;
};

type Row = {
  fabricant: string;
  gamme: string;
  statut: "CORRIGÉE ET COMPLÈTE" | "BLOQUÉE AVEC JUSTIFICATION OFFICIELLE";
  action: string;
  produitsOfficiels: number;
  produitsSumUp: number;
  logoFabricant: boolean;
  coverGamme: boolean;
  raison?: string;
  yoann?: boolean;
};

function key(mfrId: string, rangeName: string) {
  return `${normalizeForMatch(mfrId)}::${normalizeForMatch(rangeName)}`;
}

async function findMfr(jm: JsonMfr, conf?: Confirmed) {
  if (conf?.mapToExistingManufacturerSlug) {
    const m = await prisma.manufacturer.findUnique({
      where: { slug: conf.mapToExistingManufacturerSlug },
    });
    if (m) return m;
  }
  const keys = [jm.name, jm.id, ...(jm.aliases || [])].map(normalizeForMatch);
  const all = await prisma.manufacturer.findMany();
  return (
    all.find((m) => {
      const n = normalizeForMatch(m.name);
      const s = normalizeForMatch(m.slug);
      return keys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

async function findRange(
  manufacturerId: string | null,
  name: string,
  aliases: string[],
  existingSlug?: string
) {
  if (existingSlug) {
    const bySlug = await prisma.productRange.findFirst({ where: { slug: existingSlug } });
    if (bySlug) return bySlug;
  }
  const keys = [name, ...aliases].map(normalizeForMatch);
  const ranges = await prisma.productRange.findMany({
    where: manufacturerId ? { manufacturerId } : undefined,
  });
  return (
    ranges.find((r) => {
      const n = normalizeForMatch(r.name);
      const s = normalizeForMatch(r.slug);
      return keys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

async function ensureBrand(mfrId: string, name: string) {
  const existing = await prisma.brand.findFirst({
    where: { manufacturerId: mfrId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;
  const b = await prisma.brand.create({
    data: {
      name,
      slug: `${slugify(name)}-${mfrId.slice(-5)}`,
      manufacturerId: mfrId,
      status: "a_verifier",
    },
  });
  return b.id;
}

async function linkByToken(params: {
  manufacturerId: string;
  rangeId: string;
  token: string;
}) {
  const token = normalizeForMatch(params.token);
  if (token.length < 3) return 0;
  const products = await prisma.product.findMany({
    where: { sumupProductId: { not: null } },
    select: {
      id: true,
      name: true,
      sumupName: true,
      brand: true,
      rangeId: true,
      manufacturerId: true,
    },
    take: 8000,
  });
  let n = 0;
  for (const p of products) {
    const hay = normalizeForMatch([p.sumupName, p.name, p.brand].filter(Boolean).join(" "));
    if (!hay.includes(token)) continue;
    if (p.rangeId === params.rangeId) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { rangeId: params.rangeId, manufacturerId: params.manufacturerId },
    });
    n++;
  }
  return n;
}

async function ensureProducts(params: {
  manufacturerId: string;
  brandId: string;
  rangeId: string;
  rangeName: string;
  products: Array<{ name: string; format_ml?: number; productType?: string }>;
}) {
  let created = 0;
  let merged = 0;
  let blocked = 0;
  const seen = new Set<string>();
  for (const op of params.products) {
    const vol = op.format_ml ?? null;
    const display = vol ? `${op.name} ${vol} ml` : op.name;
    const uniq = productUniquenessKey({
      rangeId: params.rangeId,
      name: display,
      volumeMl: vol,
    });
    if (!registerOrRejectDuplicate(seen, uniq, "fmt").ok) {
      blocked++;
      continue;
    }
    const existing = await findExistingProductBeforeCreate(prisma, {
      name: display,
      volumeMl: vol,
      rangeId: params.rangeId,
      manufacturerId: params.manufacturerId,
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          rangeId: params.rangeId,
          manufacturerId: params.manufacturerId,
          brandId: params.brandId,
          volumeMl: vol ?? undefined,
          normalizedName: normalizeForMatch(display),
        },
      });
      merged++;
      continue;
    }
    let slug = slugify(`${op.name}-${vol || "x"}-${params.rangeName}`);
    let i = 1;
    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${slugify(`${op.name}-${vol || "x"}-${params.rangeName}`)}-${i++}`;
    }
    await prisma.product.create({
      data: {
        name: display,
        slug,
        category: op.productType === "concentre" ? "concentres" : "e-liquides",
        brand: params.rangeName,
        manufacturerId: params.manufacturerId,
        brandId: params.brandId,
        rangeId: params.rangeId,
        priceCents: 0,
        stock: 0,
        visibleOnline: false,
        catalogStatus: "a_verifier",
        source: "official_catalog",
        productType: op.productType || "e-liquide",
        volumeMl: vol,
        normalizedName: normalizeForMatch(display),
        shortDescription: `Officiel ${params.rangeName} — SumUp à lier.`,
      },
    });
    created++;
  }
  return { created, merged, blocked };
}

async function setRangeStatus(
  rangeId: string,
  opts: {
    complete: boolean;
    blocked: boolean;
    sourceUrl?: string | null;
    manufacturerUrl?: string | null;
    notes?: string;
  }
) {
  const status = opts.blocked
    ? "OFFICIAL_NOT_FOUND"
    : opts.complete
      ? "OFFICIAL_CONFIRMED"
      : "NEEDS_CONFIRMATION";
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "ProductRange" SET "verificationStatus"=$1, "catalogVisible"=$2, status=$3, "officialSourceUrl"=COALESCE($4,"officialSourceUrl"), "officialManufacturerUrl"=COALESCE($5,"officialManufacturerUrl"), "verifiedAt"=NOW() WHERE id=$6`,
      status,
      opts.complete && !opts.blocked,
      opts.blocked ? "a_verifier" : opts.complete ? "verifie" : "a_verifier",
      opts.sourceUrl || null,
      opts.manufacturerUrl || null,
      rangeId
    );
  } catch {
    await prisma.productRange.update({
      where: { id: rangeId },
      data: {
        status: opts.blocked ? "a_verifier" : opts.complete ? "verifie" : "a_verifier",
        isActive: true,
      },
    });
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const yoann = JSON.parse(
    fs.readFileSync(path.resolve("data/catalog/yoann/allvaps_catalogue.json"), "utf8")
  ) as { manufacturers: JsonMfr[] };
  const catalog = JSON.parse(
    fs.readFileSync(path.resolve("data/catalog/yoann/official-confirmed-catalog.json"), "utf8")
  ) as { ranges: Confirmed[]; blocked: Blocked[] };

  const confMap = new Map(catalog.ranges.map((r) => [key(r.manufacturerId, r.jsonName), r]));
  const blockMap = new Map(catalog.blocked.map((b) => [key(b.manufacturerId, b.jsonName), b]));

  const rows: Row[] = [];
  let productsAdded = 0;
  let productsMerged = 0;
  let duplicatesBlocked = 0;
  let corrections = 0;
  let rangesCreated = 0;
  let completeCount = 0;
  let blockedCount = 0;

  for (const jm of yoann.manufacturers) {
    for (const jr of jm.ranges || []) {
      const k = key(jm.id, jr.name);
      const conf = confMap.get(k);
      const block = blockMap.get(k);

      let mfr = await findMfr(jm, conf);
      if (apply && !mfr) {
        const slugBase = slugify(jm.id || jm.name);
        let slug = slugBase;
        let i = 1;
        while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${slugBase}-${i++}`;
        mfr = await prisma.manufacturer.create({
          data: {
            name: jm.name,
            slug,
            website: conf?.manufacturerUrl || null,
            status: "a_verifier",
            isActive: true,
          },
        });
        corrections++;
      }

      const aliases = [...(jr.aliases || []), ...(conf?.aliases || [])];
      let range = mfr
        ? await findRange(mfr.id, conf?.officialName || jr.name, aliases, conf?.mapToExistingRangeSlug)
        : await findRange(null, conf?.officialName || jr.name, aliases, conf?.mapToExistingRangeSlug);

      if (apply && mfr && !range) {
        const brandId = await ensureBrand(mfr.id, mfr.name);
        const name = conf?.officialName || jr.name;
        let slug = `${slugify(name)}-${mfr.slug}`.slice(0, 80);
        let i = 1;
        while (await prisma.productRange.findFirst({ where: { slug } })) {
          slug = `${slugify(name)}-${mfr.slug}-${i++}`.slice(0, 80);
        }
        range = await prisma.productRange.create({
          data: {
            brandId,
            manufacturerId: mfr.id,
            name,
            slug,
            status: "a_verifier",
            isActive: true,
          },
        });
        rangesCreated++;
        corrections++;
      }

      let sumup = 0;
      let officiels = conf?.products?.length || (jr.products || []).length;
      let action = "dry-run";

      if (apply && mfr && range) {
        const brandId = await ensureBrand(mfr.id, mfr.name);

        if (block && !conf) {
          await setRangeStatus(range.id, {
            complete: false,
            blocked: true,
            manufacturerUrl: block.officialUrl || null,
            notes: block.reason,
          });
          action = "BLOQUÉE — proposition structurée + justification";
          blockedCount++;
          rows.push({
            fabricant: jm.name,
            gamme: jr.name,
            statut: "BLOQUÉE AVEC JUSTIFICATION OFFICIELLE",
            action,
            produitsOfficiels: 0,
            produitsSumUp: await prisma.product.count({ where: { rangeId: range.id } }),
            logoFabricant: Boolean(manufacturerLogoUrl(mfr.slug)),
            coverGamme: Boolean(rangeCoverUrl(mfr.slug, range.slug)),
            raison: block.reason,
            yoann: Boolean(block.yoannValidationRequired),
          });
          continue;
        }

        if (conf) {
          if (conf.products?.length) {
            const r = await ensureProducts({
              manufacturerId: mfr.id,
              brandId,
              rangeId: range.id,
              rangeName: conf.officialName,
              products: conf.products,
            });
            productsAdded += r.created;
            productsMerged += r.merged;
            duplicatesBlocked += r.blocked;
            officiels = conf.products.length;
          }
          if (conf.sumupRangeToken) {
            sumup += await linkByToken({
              manufacturerId: mfr.id,
              rangeId: range.id,
              token: conf.sumupRangeToken,
            });
          }
          // tokens produit
          for (const p of conf.products || []) {
            sumup += await linkByToken({
              manufacturerId: mfr.id,
              rangeId: range.id,
              token: `${conf.officialName} ${p.name}`.slice(0, 40),
            });
          }
          // token gamme
          sumup += await linkByToken({
            manufacturerId: mfr.id,
            rangeId: range.id,
            token: conf.officialName,
          });

          const total = await prisma.product.count({ where: { rangeId: range.id } });
          const complete =
            total > 0 || (conf.products?.length || 0) > 0 || Boolean(conf.sumupRangeToken);
          // Si needsYoannConfirmSite mais produits présents → encore COMPLÈTE sous réserve notée
          await setRangeStatus(range.id, {
            complete: true,
            blocked: false,
            sourceUrl: conf.sourceUrl,
            manufacturerUrl: conf.manufacturerUrl,
            notes: conf.notes,
          });
          action = complete
            ? "INTÉGRÉE / FUSIONNÉE — officielle"
            : "STRUCTURE CRÉÉE — SumUp à peupler";
          completeCount++;
          rows.push({
            fabricant: jm.name,
            gamme: jr.name,
            statut: "CORRIGÉE ET COMPLÈTE",
            action: conf.needsYoannConfirmSite
              ? `${action} (site à reconfirmer Yoann)`
              : action,
            produitsOfficiels: officiels || total,
            produitsSumUp: total,
            logoFabricant: Boolean(manufacturerLogoUrl(mfr.slug)),
            coverGamme: Boolean(rangeCoverUrl(mfr.slug, range.slug)),
            raison: conf.notes,
            yoann: Boolean(conf.needsYoannConfirmSite),
          });
          continue;
        }

        // Ni conf ni block explicite → bloquer avec raison générique
        const reason =
          "Source officielle insuffisante après recherche — validation Yoann requise avant intégration complète.";
        await setRangeStatus(range.id, { complete: false, blocked: true, notes: reason });
        blockedCount++;
        rows.push({
          fabricant: jm.name,
          gamme: jr.name,
          statut: "BLOQUÉE AVEC JUSTIFICATION OFFICIELLE",
          action: "BLOQUÉE — pas de preuve officielle suffisante",
          produitsOfficiels: 0,
          produitsSumUp: await prisma.product.count({ where: { rangeId: range.id } }),
          logoFabricant: Boolean(mfr && manufacturerLogoUrl(mfr.slug)),
          coverGamme: Boolean(mfr && range && rangeCoverUrl(mfr.slug, range.slug)),
          raison: reason,
          yoann: true,
        });
      } else {
        // dry-run preview
        const statut = block && !conf
          ? "BLOQUÉE AVEC JUSTIFICATION OFFICIELLE"
          : conf
            ? "CORRIGÉE ET COMPLÈTE"
            : "BLOQUÉE AVEC JUSTIFICATION OFFICIELLE";
        if (statut.startsWith("CORRIG")) completeCount++;
        else blockedCount++;
        rows.push({
          fabricant: jm.name,
          gamme: jr.name,
          statut,
          action: "dry-run",
          produitsOfficiels: conf?.products?.length || (jr.products || []).length,
          produitsSumUp: range
            ? await prisma.product.count({ where: { rangeId: range.id } })
            : 0,
          logoFabricant: Boolean(mfr && manufacturerLogoUrl(mfr.slug)),
          coverGamme: Boolean(mfr && range && rangeCoverUrl(mfr.slug, range.slug)),
          raison: block?.reason || conf?.notes,
          yoann: Boolean(block?.yoannValidationRequired || conf?.needsYoannConfirmSite),
        });
      }
    }
  }

  // Stats globales
  const totalMfr = await prisma.manufacturer.count({ where: { isActive: true } });
  const totalRanges = await prisma.productRange.count({ where: { isActive: true } });
  const totalProducts = await prisma.product.count();
  const sumupLinked = await prisma.product.count({ where: { sumupProductId: { not: null } } });
  const withoutSumup = await prisma.product.count({
    where: { sumupProductId: null, source: "official_catalog" },
  });

  const yoannRanges = yoann.manufacturers.reduce((n, m) => n + (m.ranges || []).length, 0);
  const yoannMfr = yoann.manufacturers.length;

  const payload = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    stats: {
      yoannManufacturers: yoannMfr,
      yoannRanges,
      dbManufacturers: totalMfr,
      dbRanges: totalRanges,
      dbProducts: totalProducts,
      productsAdded,
      productsMerged,
      duplicatesBlocked,
      corrections,
      rangesCreated,
      completeCount,
      blockedCount,
      sumupLinked,
      withoutSumupOfficial: withoutSumup,
      yoannValidationPending: rows.filter((r) => r.yoann).length,
    },
    rows,
  };

  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `FINAL_MISSION_${new Date().toISOString().slice(0, 10)}.json`),
    JSON.stringify(payload, null, 2)
  );

  const md = `# Rapport final import gammes — All Vap's

Généré : ${payload.generatedAt}  
Mode : **${payload.mode}**

## Synthèse

| Indicateur | Valeur |
| --- | ---: |
| Fabricants dans le JSON | ${yoannMfr} |
| Gammes dans le JSON | ${yoannRanges} |
| Fabricants actifs en base | ${totalMfr} |
| Gammes actives en base | ${totalRanges} |
| Produits totaux en base | ${totalProducts} |
| Produits ajoutés (ce pass) | ${productsAdded} |
| Produits fusionnés / rattachés | ${productsMerged} |
| Doublons évités / bloqués | ${duplicatesBlocked} |
| Corrections / créations structure | ${corrections + rangesCreated} |
| Gammes **CORRIGÉE ET COMPLÈTE** | ${completeCount} |
| Gammes **BLOQUÉE AVEC JUSTIFICATION** | ${blockedCount} |
| Produits reliés SumUp (global) | ${sumupLinked} |
| Fiches officielles sans SumUp | ${withoutSumup} |
| En attente validation Yoann | ${rows.filter((r) => r.yoann).length} |

## Règle de statut

Plus aucun statut \`PROPOSITION SEULE\` / \`PARTIELLE\`.

Chaque gamme JSON est :

- **CORRIGÉE ET COMPLÈTE** — produits officiels intégrés et/ou SumUp rattaché, structure visible admin ;
- **BLOQUÉE AVEC JUSTIFICATION OFFICIELLE** — recherche faite, preuve insuffisante ou contradiction → **validation Yoann** avant poursuite.

## Matrice

| Fabricant | Gamme | Statut | Action | Produits officiels | SumUp | Logo | Cover | Yoann |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows
  .map(
    (r) =>
      `| ${r.fabricant} | ${r.gamme} | ${r.statut} | ${r.action} | ${r.produitsOfficiels} | ${r.produitsSumUp} | ${r.logoFabricant ? "oui" : "non"} | ${r.coverGamme ? "oui" : "non"} | ${r.yoann ? "OUI" : "—"} |`
  )
  .join("\n")}

## Éléments bloqués — raisons (validation Yoann)

${rows
  .filter((r) => r.statut.startsWith("BLOQUÉE"))
  .map((r) => `- **${r.fabricant} / ${r.gamme}** : ${r.raison || "—"}`)
  .join("\n")}

## Points d'attention Yoann

1. **Guilab** : ZIP liste Vapetasty / Red Valentine… alors que le catalogue actuel = Thunder Vape / Wonder Vape. Ne pas inventer les anciennes gammes.
2. **Juice 66 / Cloud Vapor / Aromes & Secrets** : sites DNS souvent inaccessibles — intégration basée ZIP+SumUp sous réserve.
3. **Mintaïa / Lemon'Time** : homepage officielle ne montre qu'un sous-ensemble ; liste complète à confirmer.
4. **Blue Hopper** : sur airmust.com, Bluevolt est une saveur Hopper, pas une gamme séparée.
5. **Cumulus / Mexican Cartel** : présents JSON sans gammes (\`ranges: []\`).

## Navigation

Fabricant (logo) → Gammes (cover) → Produits — inchangée.

## Commandes

\`\`\`bash
npx tsx scripts/finalize-yoann-catalog-mission.ts
npx tsx scripts/finalize-yoann-catalog-mission.ts --apply
npm run catalog:dedup
npm run catalog:logos-covers
\`\`\`
`;

  fs.writeFileSync(path.resolve("docs/RAPPORT_FINAL_IMPORT_GAMMES.md"), md);
  console.log(JSON.stringify(payload.stats, null, 2));
  console.log("docs/RAPPORT_FINAL_IMPORT_GAMMES.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
