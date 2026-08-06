/**
 * Pass de correction ZIP Yoann :
 * - aucune gamme ignored (products: [] = recherche officielle)
 * - alias officiels (Golf City → Godfall City, MIST → Myst…)
 * - création / fusion gammes confirmées
 * - rattachement SumUp sans écraser le stock
 * - produits officiels absents SumUp → fiche hors stock / non publiée
 *
 * Usage:
 *   npx tsx scripts/apply-yoann-correction-pass.ts
 *   npx tsx scripts/apply-yoann-correction-pass.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { normalizeForMatch } from "../lib/catalog/official-verification";
import { verifyRangeOnOfficialSite } from "../lib/catalog/verify-range-official";
import {
  findExistingProductBeforeCreate,
  productUniquenessKey,
  registerOrRejectDuplicate,
} from "../lib/catalog/assert-no-duplicates";

type JsonProduct = { name: string; format_ml?: number; flavor?: string };
type JsonRange = { name: string; aliases?: string[]; products?: JsonProduct[] };
type JsonMfr = {
  id: string;
  name: string;
  aliases?: string[];
  ranges?: JsonRange[];
};

type ConfirmedRange = {
  manufacturerId: string;
  jsonName: string;
  officialName: string;
  aliases?: string[];
  sourceUrl: string | null;
  manufacturerUrl: string | null;
  products?: Array<{ name: string; format_ml?: number; productType?: string }>;
  notes?: string;
  mapToExistingManufacturerSlug?: string;
  mapToExistingRangeSlug?: string;
};

type ReportRow = {
  fabricant: string;
  gammeDemandee: string;
  presenteAvant: boolean;
  action: string;
  produitsOfficielsTrouves: number;
  produitsSumUpLies: number;
  visibleSurSite: boolean;
  statut: string;
  notes: string;
};

const OFFICIAL_SITES: Record<
  string,
  { website: string; seedUrls?: string[]; aliasesByRange?: Record<string, string[]> }
> = {
  guilab: { website: "https://www.guilab.fr/" },
  swoke: { website: "https://www.swoke.fr/" },
  "juice-66": { website: "https://www.juice66.fr/" },
  "aromes-secrets": { website: "https://www.aromesetsecrets.com/" },
  "cloud-vapor": {
    website: "https://www.cloud-vapor.com/",
    seedUrls: ["https://www.cloud-vapor.com/", "https://www.cloud-vapor.com/collections"],
  },
  etasty: {
    website: "https://pro.e-tasty.fr/",
    seedUrls: [
      "https://pro.e-tasty.fr/",
      "https://pro.e-tasty.fr/91_twenty",
      "https://pro.e-tasty.fr/90_letters",
      "https://pro.e-tasty.fr/92_godfall-city",
    ],
    aliasesByRange: {
      "Golf City": ["Godfall City", "God Fall City"],
    },
  },
  "the-fuu": { website: "https://www.thefuu.com/" },
  airmust: { website: "https://www.airmust.com/" },
  "vape-47": {
    website: "https://www.vape47.com/",
    seedUrls: [
      "https://order.vape47.com/8902-eliquid-enfer",
      "https://www.vape47.com/",
    ],
  },
  "eliquid-france": { website: "https://www.eliquid-france.com/" },
  liquideo: {
    website: "https://www.liquideo.com/",
    seedUrls: [
      "https://www.liquideo.com/fr/",
      "https://www.liquideo.com/fr/74-e-liquides-evolution",
      "https://www.liquideo.com/fr/233-e-liquides-dragonzz",
      "https://www.liquideo.com/fr/163-e-liquides-freeze",
    ],
    aliasesByRange: {
      Dragonz: ["Dragonzz", "DragonZZ"],
      "Freeze Citrus": ["Freeze", "Freeze Citrus"],
      "Les Essentiels": ["Essentiels", "Les Essentiels"],
    },
  },
  "cookin-cloud": {
    website: "https://www.cookincloud.com/",
    aliasesByRange: { MIST: ["Myst", "MYST", "MIST"] },
  },
  "t-juice": { website: "https://www.t-juice.com/" },
  "revenge-juices": { website: "https://www.revengejuices.com/" },
  avap: { website: "https://www.avap.fr/" },
  fruizee: { website: "https://www.fruizee.fr/" },
  protect: { website: "https://www.protect.fr/" },
  "big-kawa": { website: "https://liquidelab.com/" },
};

function confirmedKey(mfrId: string, rangeName: string) {
  return `${normalizeForMatch(mfrId)}::${normalizeForMatch(rangeName)}`;
}

async function findMfr(jm: JsonMfr, confirmed?: ConfirmedRange) {
  if (confirmed?.mapToExistingManufacturerSlug) {
    const bySlug = await prisma.manufacturer.findUnique({
      where: { slug: confirmed.mapToExistingManufacturerSlug },
    });
    if (bySlug) return bySlug;
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
  aliases?: string[],
  existingSlug?: string
) {
  if (existingSlug) {
    const bySlug = await prisma.productRange.findFirst({ where: { slug: existingSlug } });
    if (bySlug) return bySlug;
  }
  const keys = [name, ...(aliases || [])].map(normalizeForMatch);
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

async function ensureBrand(mfrId: string, mfrName: string) {
  const existing = await prisma.brand.findFirst({
    where: { manufacturerId: mfrId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;
  const created = await prisma.brand.create({
    data: {
      name: mfrName,
      slug: `${slugify(mfrName)}-${mfrId.slice(-5)}`,
      manufacturerId: mfrId,
      status: "a_verifier",
    },
  });
  return created.id;
}

async function linkSumUpProducts(params: {
  manufacturerId: string;
  rangeId: string;
  rangeName: string;
  aliases: string[];
  productHints: string[];
}) {
  // Uniquement tokens de gamme (pas d'arômes génériques type "Mangue", "Fruits Rouges")
  const rangeKeys = [params.rangeName, ...params.aliases]
    .map(normalizeForMatch)
    .filter((k) => k.length >= 4);
  if (rangeKeys.length === 0) return 0;

  const products = await prisma.product.findMany({
    where: {
      OR: [{ sumupProductId: { not: null } }, { visibleOnline: true }],
    },
    select: {
      id: true,
      name: true,
      sumupName: true,
      brand: true,
      rangeId: true,
      manufacturerId: true,
      visibleOnline: true,
      sumupProductId: true,
    },
    take: 5000,
  });

  let linked = 0;
  for (const p of products) {
    const hay = normalizeForMatch([p.sumupName, p.name, p.brand].filter(Boolean).join(" "));
    if (!rangeKeys.some((k) => hay.includes(k))) continue;
    if (p.rangeId === params.rangeId && p.manufacturerId === params.manufacturerId) continue;
    if (!p.sumupProductId && !p.visibleOnline) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { rangeId: params.rangeId, manufacturerId: params.manufacturerId },
    });
    linked++;
  }
  return linked;
}

async function ensureOfficialProducts(params: {
  manufacturerId: string;
  brandId: string;
  rangeId: string;
  rangeName: string;
  products: Array<{ name: string; format_ml?: number; productType?: string }>;
}) {
  let created = 0;
  let merged = 0;
  let duplicatesBlocked = 0;
  const seenKeys = new Set<string>();

  for (const op of params.products) {
    const vol = op.format_ml || null;
    const displayName = vol ? `${op.name} ${vol} ml` : op.name;
    const uniq = productUniquenessKey({
      rangeId: params.rangeId,
      name: displayName,
      volumeMl: vol,
    });
    const reg = registerOrRejectDuplicate(seenKeys, uniq, "range_name_format");
    if (!reg.ok) {
      duplicatesBlocked++;
      continue;
    }

    // OBLIGATOIRE : contrôle anti-doublon AVANT toute création
    const existing = await findExistingProductBeforeCreate(prisma, {
      name: displayName,
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
          normalizedName: normalizeForMatch(displayName),
        },
      });
      merged++;
      duplicatesBlocked++;
      continue;
    }

    // Recherche SumUp plus large déjà couverte par findExistingProductBeforeCreate
    let slug = slugify(`${op.name}-${vol || "x"}-${params.rangeName}`);
    let i = 1;
    while (await prisma.product.findUnique({ where: { slug } })) {
      // Slug pris = doublon potentiel → ne pas créer sous un autre slug si même produit
      const bySlug = await findExistingProductBeforeCreate(prisma, {
        name: displayName,
        volumeMl: vol,
        rangeId: params.rangeId,
        manufacturerId: params.manufacturerId,
        slug,
      });
      if (bySlug) {
        await prisma.product.update({
          where: { id: bySlug.id },
          data: {
            rangeId: params.rangeId,
            manufacturerId: params.manufacturerId,
            brandId: params.brandId,
            volumeMl: vol ?? undefined,
          },
        });
        merged++;
        duplicatesBlocked++;
        slug = "";
        break;
      }
      slug = `${slugify(`${op.name}-${vol || "x"}-${params.rangeName}`)}-${i++}`;
    }
    if (!slug) continue;

    await prisma.product.create({
      data: {
        name: displayName,
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
        normalizedName: normalizeForMatch(displayName),
        shortDescription: `Fiche catalogue officielle (${params.rangeName}) — stock SumUp à lier.`,
        importAnomaly: null,
      },
    });
    created++;
  }
  return { created, merged, duplicatesBlocked };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const yoannPath = path.resolve("data/catalog/yoann/allvaps_catalogue.json");
  const confirmedPath = path.resolve("data/catalog/yoann/official-confirmed-catalog.json");
  const json = JSON.parse(fs.readFileSync(yoannPath, "utf8")) as { manufacturers: JsonMfr[] };
  const confirmedFile = JSON.parse(fs.readFileSync(confirmedPath, "utf8")) as {
    ranges: ConfirmedRange[];
  };
  const confirmedMap = new Map(
    confirmedFile.ranges.map((r) => [confirmedKey(r.manufacturerId, r.jsonName), r])
  );

  const rows: ReportRow[] = [];
  let createdRanges = 0;
  let completedRanges = 0;
  let productsAdded = 0;
  let productsMerged = 0;
  let duplicatesAvoided = 0;
  let proposals = 0;

  for (const jm of json.manufacturers) {
    const site = OFFICIAL_SITES[jm.id];

    for (const jr of jm.ranges || []) {
      const conf = confirmedMap.get(confirmedKey(jm.id, jr.name));
      const aliases = [
        ...(jr.aliases || []),
        ...(conf?.aliases || []),
        ...(site?.aliasesByRange?.[jr.name] || []),
      ];
      const searchAliases = [...new Set(aliases)];
      const listed = jr.products || [];
      const officialProducts = conf?.products?.length
        ? conf.products
        : listed.map((p) => ({ name: p.name, format_ml: p.format_ml }));

      let mfr = await findMfr(jm, conf);
      const before = mfr
        ? Boolean(
            await findRange(
              mfr.id,
              conf?.officialName || jr.name,
              searchAliases,
              conf?.mapToExistingRangeSlug
            )
          )
        : Boolean(
            await findRange(null, conf?.officialName || jr.name, searchAliases, conf?.mapToExistingRangeSlug)
          );

      const check = conf?.sourceUrl
        ? {
            verificationStatus: "OFFICIAL_CONFIRMED" as const,
            officialNameFound: conf.officialName,
            officialSourceUrl: conf.sourceUrl,
            officialManufacturerUrl: conf.manufacturerUrl,
            evidence: { notes: ["catalogue officiel confirmé (fichier curated)"] },
          }
        : await verifyRangeOnOfficialSite({
            proposedName: jr.name,
            manufacturerName: jm.name,
            manufacturerWebsite: site?.website || mfr?.website || null,
            seedUrls: [
              ...(site?.seedUrls || []),
              ...(conf?.sourceUrl ? [conf.sourceUrl] : []),
            ],
            searchAliases,
          });

      let action = "dry-run";
      let statut = "PARTIELLE";
      let sumupLies = 0;
      let visible = false;
      let notes = `${check.verificationStatus} · jsonProducts=${listed.length} · emptyMeans=RECHERCHE_OFFICIELLE`;

      if (apply) {
        if (!mfr) {
          const slugBase = slugify(jm.id || jm.name);
          let slug = slugBase;
          let i = 1;
          while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${slugBase}-${i++}`;
          mfr = await prisma.manufacturer.create({
            data: {
              name: jm.name,
              slug,
              website: site?.website || conf?.manufacturerUrl || null,
              status: "a_verifier",
              isActive: true,
            },
          });
          action = "FABRICANT CRÉÉ";
        } else if (site?.website && !mfr.website) {
          mfr = await prisma.manufacturer.update({
            where: { id: mfr.id },
            data: { website: site.website },
          });
        }

        const brandId = await ensureBrand(mfr.id, mfr.name);
        const confirmed =
          check.verificationStatus === "OFFICIAL_CONFIRMED" ||
          check.verificationStatus === "NAME_CORRECTION" ||
          Boolean(conf);

        let range = await findRange(
          mfr.id,
          conf?.officialName || jr.name,
          searchAliases,
          conf?.mapToExistingRangeSlug
        );

        if (!range && (confirmed || listed.length > 0 || (officialProducts?.length || 0) > 0)) {
          const name = conf?.officialName || check.officialNameFound || jr.name;
          const slugBase = slugify(name);
          let slug = `${slugBase}-${mfr.slug}`.slice(0, 80);
          let i = 1;
          while (await prisma.productRange.findFirst({ where: { slug } })) {
            slug = `${slugBase}-${mfr.slug}-${i++}`.slice(0, 80);
          }
          range = await prisma.productRange.create({
            data: {
              brandId,
              manufacturerId: mfr.id,
              name,
              slug,
              status: confirmed ? "verifie" : "a_verifier",
              isActive: true,
            },
          });
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE "ProductRange" SET "verificationStatus"=$1, "catalogVisible"=$2, "officialSourceUrl"=$3, "officialManufacturerUrl"=$4, "verifiedAt"=NOW() WHERE id=$5`,
              confirmed ? "OFFICIAL_CONFIRMED" : "NEEDS_CONFIRMATION",
              confirmed,
              check.officialSourceUrl || conf?.sourceUrl || null,
              check.officialManufacturerUrl || conf?.manufacturerUrl || site?.website || null,
              range.id
            );
          } catch {
            /* ignore */
          }
          createdRanges++;
          action = confirmed ? "CRÉÉE (officielle)" : "CRÉÉE (brouillon)";
        } else if (range) {
          action = before ? "FUSIONNÉE" : "RATTACHÉE";
          if (confirmed) {
            try {
              await prisma.$executeRawUnsafe(
                `UPDATE "ProductRange" SET "verificationStatus"='OFFICIAL_CONFIRMED', "catalogVisible"=true, status='verifie', name=$1, "officialSourceUrl"=$2, "officialManufacturerUrl"=$3, "verifiedAt"=NOW() WHERE id=$4`,
                conf?.officialName || range.name,
                check.officialSourceUrl || conf?.sourceUrl || null,
                check.officialManufacturerUrl || conf?.manufacturerUrl || site?.website || null,
                range.id
              );
            } catch {
              /* ignore */
            }
            if (conf?.officialName && conf.officialName !== range.name) {
              await prisma.productRange.update({
                where: { id: range.id },
                data: { name: conf.officialName },
              });
              notes += ` · rename→${conf.officialName}`;
            }
          }
        } else {
          action = "PROPOSITION SEULE";
          statut =
            check.verificationStatus === "OFFICIAL_NOT_FOUND"
              ? "SOURCE OFFICIELLE INTROUVABLE"
              : "BLOQUÉE PAR INCERTITUDE";
        }

        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "CatalogRangeProposal" (id, "manufacturerId", "proposedName", "proposedBy", "verificationStatus", "officialNameFound", "officialSourceUrl", "officialManufacturerUrl", "verifiedAt", notes, "evidenceJson", "createdAt", "updatedAt")
             VALUES ($1,$2,$3,'yoann-correction',$4,$5,$6,$7,NOW(),$8,$9,NOW(),NOW())`,
            `crp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            mfr.id,
            jr.name,
            check.verificationStatus,
            conf?.officialName || check.officialNameFound,
            check.officialSourceUrl || conf?.sourceUrl,
            check.officialManufacturerUrl || conf?.manufacturerUrl || site?.website,
            `correction-pass · jsonP=${listed.length} · emptyMeans=RECHERCHE_OFFICIELLE`,
            JSON.stringify({
              aliases: searchAliases,
              listed,
              officialProducts,
              curated: Boolean(conf),
              notes: conf?.notes || null,
            })
          );
          proposals++;
        } catch (e) {
          notes += ` · proposal:${e instanceof Error ? e.message.slice(0, 80) : e}`;
        }

        if (range) {
          sumupLies = await linkSumUpProducts({
            manufacturerId: mfr.id,
            rangeId: range.id,
            rangeName: conf?.officialName || jr.name,
            aliases: searchAliases,
            productHints: (officialProducts || []).map((p) => p.name),
          });
          duplicatesAvoided += sumupLies;

          if (officialProducts?.length) {
            const { created, merged, duplicatesBlocked } = await ensureOfficialProducts({
              manufacturerId: mfr.id,
              brandId,
              rangeId: range.id,
              rangeName: conf?.officialName || jr.name,
              products: officialProducts,
            });
            productsAdded += created;
            productsMerged += merged;
            notes += ` · +${created} fiches · ~${merged} fusion · !${duplicatesBlocked} doublons_bloqués`;
          }

          const online = await prisma.product.count({
            where: { rangeId: range.id, visibleOnline: true },
          });
          const total = await prisma.product.count({ where: { rangeId: range.id } });
          visible = online > 0;
          if (confirmed && total > 0 && (online > 0 || sumupLies > 0 || productsAdded >= 0)) {
            if (online > 0 && (officialProducts?.length || 0) > 0 && total >= (officialProducts?.length || 0)) {
              statut = "CORRIGÉE ET COMPLÈTE";
              completedRanges++;
            } else if (total > 0) {
              statut = "PARTIELLE";
            } else {
              statut = "ABSENTE DE SUMUP";
            }
          } else if (!confirmed) {
            statut =
              check.verificationStatus === "OFFICIAL_NOT_FOUND"
                ? "SOURCE OFFICIELLE INTROUVABLE"
                : "BLOQUÉE PAR INCERTITUDE";
          } else if (total === 0) {
            statut = "ABSENTE DE SUMUP";
          } else {
            statut = "PARTIELLE";
          }
        }
      } else {
        statut =
          check.verificationStatus === "OFFICIAL_CONFIRMED"
            ? before
              ? "À COMPLÉTER"
              : "À CRÉER"
            : check.verificationStatus === "OFFICIAL_NOT_FOUND"
              ? "SOURCE OFFICIELLE INTROUVABLE"
              : "BLOQUÉE PAR INCERTITUDE";
        if (conf) statut = before ? "À FUSIONNER / COMPLÉTER" : "À CRÉER (curated)";
        action = "dry-run";
      }

      rows.push({
        fabricant: jm.name,
        gammeDemandee: jr.name,
        presenteAvant: before,
        action,
        produitsOfficielsTrouves: officialProducts?.length || listed.length,
        produitsSumUpLies: sumupLies,
        visibleSurSite: visible,
        statut,
        notes: conf?.notes ? `${notes} · ${conf.notes}` : notes,
      });

      console.log(
        `${jm.name} / ${jr.name} → ${statut} (${action}) officiels=${officialProducts?.length || 0} sumup=${sumupLies}`
      );
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    stats: {
      manufacturersJson: json.manufacturers.length,
      rangesJson: rows.length,
      rangesPresentBefore: rows.filter((r) => r.presenteAvant).length,
      createdRanges,
      completedRanges,
      productsAdded,
      productsMerged,
      duplicatesAvoided,
      proposals,
      stillToConfirm: rows.filter((r) =>
        ["BLOQUÉE PAR INCERTITUDE", "SOURCE OFFICIELLE INTROUVABLE", "PARTIELLE", "ABSENTE DE SUMUP"].includes(
          r.statut
        )
      ).length,
    },
    rows,
  };
  const jsonOut = path.join(outDir, `CORRECTION_PASS_${stamp}.json`);
  fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2));

  // Rapport Markdown exigé
  const mdPath = path.resolve("docs/RAPPORT_CORRECTION_IMPORT_COMPLET_GAMMES.md");
  const md = [
    `# Rapport correction import — gammes complètes`,
    ``,
    `Généré : ${payload.generatedAt}`,
    `Mode : **${payload.mode}**`,
    ``,
    `## Constat initial`,
    ``,
    `Le ZIP \`allvaps_catalogue.json\` liste les gammes, mais **56/72** avaient \`"products": []\`.`,
    `Ces tableaux vides signifient **CATALOGUE OFFICIEL À RECHERCHER**, jamais « gamme à ignorer ».`,
    ``,
    `## Synthèse chiffrée`,
    ``,
    `| Indicateur | Valeur |`,
    `| --- | ---: |`,
    `| Fabricants dans le JSON | ${payload.stats.manufacturersJson} |`,
    `| Gammes dans le JSON | ${payload.stats.rangesJson} |`,
    `| Gammes déjà présentes avant | ${payload.stats.rangesPresentBefore} |`,
    `| Gammes créées | ${payload.stats.createdRanges} |`,
    `| Gammes complétées | ${payload.stats.completedRanges} |`,
    `| Produits ajoutés (fiches catalogue) | ${payload.stats.productsAdded} |`,
    `| Produits fusionnés / rattachés | ${payload.stats.productsMerged} |`,
    `| Doublons évités (SumUp liés) | ${payload.stats.duplicatesAvoided} |`,
    `| Propositions CatalogRangeProposal | ${payload.stats.proposals} |`,
    `| Éléments encore à confirmer | ${payload.stats.stillToConfirm} |`,
    ``,
    `## Matrice exhaustive`,
    ``,
    `| Fabricant | Gamme demandée | Présente avant | Action effectuée | Produits officiels trouvés | Produits SumUp liés | Visible sur site | Statut |`,
    `| --- | --- | ---: | --- | ---: | ---: | ---: | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.fabricant} | ${r.gammeDemandee} | ${r.presenteAvant ? "oui" : "non"} | ${r.action} | ${r.produitsOfficielsTrouves} | ${r.produitsSumUpLies} | ${r.visibleSurSite ? "oui" : "non"} | ${r.statut} |`
    ),
    ``,
    `## Notes de méthode`,
    ``,
    `1. Sources prioritaires : site officiel → catalogue pro → distributeur officiel → revendeur (secondaire).`,
    `2. Alias connus appliqués : Golf City → **Godfall City** ; Dragonz → **Dragonzz** ; MIST → **Myst** ; Big Kawa → Liquide Lab.`,
    `3. Stock SumUp **jamais écrasé**. Produits officiels absents SumUp → fiche \`visibleOnline=false\`, stock 0.`,
    `4. Guilab / Swoke / Juice 66 / Protect / etc. : sites officiels souvent SPA ou absents — gammes **non inventées**, marquées explicitement.`,
    `5. Navigation attendue : Logo fabricant → cases gammes → produits de la gamme.`,
    ``,
    `## Fichiers associés`,
    ``,
    `- Audit initial : \`data/catalog/yoann/AUDIT_COMPLETENESS_2026-07-31.md\``,
    `- Catalogue curated : \`data/catalog/yoann/official-confirmed-catalog.json\``,
    `- Détail JSON de ce pass : \`${jsonOut}\``,
    ``,
  ].join("\n");
  fs.writeFileSync(mdPath, md);

  console.log(JSON.stringify(payload.stats, null, 2));
  console.log(jsonOut);
  console.log(mdPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
