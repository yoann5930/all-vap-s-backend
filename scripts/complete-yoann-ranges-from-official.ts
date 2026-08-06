/**
 * Complétion ZIP Yoann : aucune gamme ignorée (y compris products: []).
 *
 * Pour chaque gamme :
 *  - crée/retrouve fabricant + proposition
 *  - tente vérification site officiel
 *  - rattache produits SumUp déjà en base si match nom+fabricant
 *  - n'invente pas de produits / stock
 *
 * Usage:
 *   npx tsx scripts/complete-yoann-ranges-from-official.ts           # dry-run
 *   npx tsx scripts/complete-yoann-ranges-from-official.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { normalizeForMatch } from "../lib/catalog/official-verification";
import { verifyRangeOnOfficialSite } from "../lib/catalog/verify-range-official";

/** Sites officiels connus (priorité #1). */
const OFFICIAL_SITES: Record<string, { website: string; seedUrls?: string[] }> = {
  guilab: { website: "https://www.guilab.fr/" },
  swoke: { website: "https://www.swoke.fr/" },
  "juice-66": { website: "https://www.juice66.fr/" },
  "aromes-secrets": { website: "https://www.aromesetsecrets.com/" },
  "cloud-vapor": { website: "https://www.cloud-vapor.com/" },
  etasty: {
    website: "https://pro.e-tasty.fr/",
    seedUrls: [
      "https://pro.e-tasty.fr/91_twenty",
      "https://pro.e-tasty.fr/90_letters",
      "https://pro.e-tasty.fr/",
    ],
  },
  "the-fuu": { website: "https://www.thefuu.com/" },
  airmust: { website: "https://www.airmust.com/" },
  "vape-47": {
    website: "https://order.vape47.com/",
    seedUrls: [
      "https://order.vape47.com/8902-eliquid-enfer",
      "https://order.vape47.com/brand/188-enfer",
    ],
  },
  "eliquid-france": { website: "https://www.eliquid-france.com/" },
  liquideo: { website: "https://www.liquideo.com/" },
  "cookin-cloud": { website: "https://www.cookincloud.com/" },
  "t-juice": { website: "https://www.t-juice.com/" },
  "revenge-juices": { website: "https://www.revengejuices.com/" },
  avap: { website: "https://www.avap.fr/" },
  fruizee: { website: "https://www.fruizee.fr/" },
  protect: { website: "https://www.protect.fr/" },
  "big-kawa": { website: "https://liquidelab.com/" }, // Big Kawa = Liquide Lab
};

type JsonRange = { name: string; aliases?: string[]; products?: Array<{ name: string }> };
type JsonMfr = {
  id: string;
  name: string;
  aliases?: string[];
  ranges?: JsonRange[];
  standalone_products?: Array<{ name: string }>;
};

type ActionRow = {
  fabricant: string;
  gamme: string;
  presenteAvant: boolean;
  action: string;
  produitsOfficielsTrouves: number;
  produitsSumUpLies: number;
  visibleSurSite: boolean;
  statut: string;
  notes: string;
};

async function findMfr(jm: JsonMfr) {
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

async function findRange(manufacturerId: string, name: string, aliases?: string[]) {
  const keys = [name, ...(aliases || [])].map(normalizeForMatch);
  const ranges = await prisma.productRange.findMany({ where: { manufacturerId } });
  return (
    ranges.find((r) => {
      const n = normalizeForMatch(r.name);
      const s = normalizeForMatch(r.slug);
      return keys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

async function linkSumUpProductsToRange(params: {
  manufacturerId: string;
  rangeId: string;
  rangeName: string;
  productHints: string[];
}) {
  const hints = params.productHints.map(normalizeForMatch).filter(Boolean);
  const rangeKey = normalizeForMatch(params.rangeName);
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { manufacturerId: params.manufacturerId },
        { sumupProductId: { not: null } },
        { brand: { contains: params.rangeName.split(/\s+/)[0] || params.rangeName, mode: "insensitive" } },
      ],
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
    take: 3000,
  });

  let linked = 0;
  for (const p of products) {
    const hay = normalizeForMatch([p.sumupName, p.name, p.brand].filter(Boolean).join(" "));
    const hintHit =
      hints.length === 0
        ? hay.includes(rangeKey)
        : hints.some((h) => hay.includes(h) || h.includes(normalizeForMatch(p.name)));
    const rangeHit = hay.includes(rangeKey);
    if (!hintHit && !rangeHit) continue;
    if (p.rangeId === params.rangeId && p.manufacturerId === params.manufacturerId) continue;

    // Ne rattacher que si déjà SumUp ou déjà online (pas d'invention)
    if (!p.sumupProductId && !p.visibleOnline) continue;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        rangeId: params.rangeId,
        manufacturerId: params.manufacturerId,
      },
    });
    linked++;
  }
  return linked;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const json = JSON.parse(
    fs.readFileSync(path.resolve("data/catalog/yoann/allvaps_catalogue.json"), "utf8")
  ) as { manufacturers: JsonMfr[] };

  const actions: ActionRow[] = [];
  let createdRanges = 0;
  let completedRanges = 0;
  let linkedProducts = 0;
  let proposals = 0;

  for (const jm of json.manufacturers) {
    const site = OFFICIAL_SITES[jm.id];
    let mfr = await findMfr(jm);

    if (apply && !mfr) {
      const slugBase = slugify(jm.id || jm.name);
      let slug = slugBase;
      let i = 1;
      while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${slugBase}-${i++}`;
      mfr = await prisma.manufacturer.create({
        data: {
          name: jm.name,
          slug,
          website: site?.website || null,
          status: "a_verifier",
          isActive: true,
        },
      });
    } else if (apply && mfr && site?.website && !mfr.website) {
      await prisma.manufacturer.update({
        where: { id: mfr.id },
        data: { website: site.website },
      });
      mfr = { ...mfr, website: site.website };
    }

    let brandId: string | null = null;
    if (apply && mfr) {
      const brand = await prisma.brand.findFirst({
        where: { manufacturerId: mfr.id },
        orderBy: { createdAt: "asc" },
      });
      if (brand) brandId = brand.id;
      else {
        const b = await prisma.brand.create({
          data: {
            name: jm.name,
            slug: `${slugify(jm.name)}-${mfr.id.slice(-5)}`,
            manufacturerId: mfr.id,
            status: "a_verifier",
          },
        });
        brandId = b.id;
      }
    }

    for (const jr of jm.ranges || []) {
      const presenteAvant = mfr ? Boolean(await findRange(mfr.id, jr.name, jr.aliases)) : false;
      const listedHints = (jr.products || []).map((p) => p.name);

      const check = await verifyRangeOnOfficialSite({
        proposedName: jr.name,
        manufacturerName: jm.name,
        manufacturerWebsite: site?.website || mfr?.website || null,
        seedUrls: site?.seedUrls,
      });

      let rangeId: string | null = null;
      let action = "dry-run";
      let statut = "PARTIELLE";
      let notes = check.verificationStatus;
      let sumupLies = 0;
      let visible = false;
      let officiels = listedHints.length;

      if (apply && mfr && brandId) {
        // Proposition toujours (y compris products vides)
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "CatalogRangeProposal" (id, "manufacturerId", "proposedName", "proposedBy", "verificationStatus", "officialNameFound", "officialSourceUrl", "officialManufacturerUrl", "verifiedAt", notes, "evidenceJson", "createdAt", "updatedAt")
             VALUES ($1,$2,$3,'yoann',$4,$5,$6,$7,NOW(),$8,$9,NOW(),NOW())`,
            `crp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            mfr.id,
            jr.name,
            check.verificationStatus,
            check.officialNameFound,
            check.officialSourceUrl,
            check.officialManufacturerUrl,
            `productsInJson=${listedHints.length} · emptyMeans=RECHERCHE_OFFICIELLE`,
            JSON.stringify({ ...check.evidence, listedHints, aliases: jr.aliases || [] })
          );
          proposals++;
        } catch (e) {
          notes += ` · proposal_err:${e instanceof Error ? e.message : e}`;
        }

        let range = await findRange(mfr.id, jr.name, jr.aliases);
        const confirmed = check.verificationStatus === "OFFICIAL_CONFIRMED";

        if (!range && (confirmed || listedHints.length > 0)) {
          // Créer gamme seulement si confirmée OU si le JSON listait déjà des produits
          // (structure demandée) — catalogVisible seulement si OFFICIAL_CONFIRMED
          const slug = slugify(check.officialNameFound || jr.name);
          range = await prisma.productRange.create({
            data: {
              brandId,
              manufacturerId: mfr.id,
              name: check.officialNameFound || jr.name,
              slug: `${slug}-${mfr.slug}`.slice(0, 80),
              status: confirmed ? "verifie" : "a_verifier",
              isActive: true,
            },
          });
          // champs officiels via SQL si client à jour partiel
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE "ProductRange" SET "verificationStatus"=$1, "catalogVisible"=$2, "officialSourceUrl"=$3, "officialManufacturerUrl"=$4, "verifiedAt"=NOW() WHERE id=$5`,
              confirmed ? "OFFICIAL_CONFIRMED" : "NEEDS_CONFIRMATION",
              confirmed,
              check.officialSourceUrl,
              check.officialManufacturerUrl,
              range.id
            );
          } catch {
            /* ignore */
          }
          createdRanges++;
          action = confirmed ? "CRÉÉE (officielle)" : "CRÉÉE (brouillon, à confirmer)";
        } else if (range) {
          action = "FUSIONNÉE / existante";
          if (confirmed) {
            try {
              await prisma.$executeRawUnsafe(
                `UPDATE "ProductRange" SET "verificationStatus"='OFFICIAL_CONFIRMED', "catalogVisible"=true, status='verifie', "officialSourceUrl"=$1, "officialManufacturerUrl"=$2, "verifiedAt"=NOW() WHERE id=$3`,
                check.officialSourceUrl,
                check.officialManufacturerUrl,
                range.id
              );
            } catch {
              /* ignore */
            }
          }
        } else {
          action = "PROPOSITION SEULE (pas encore créée — incertitude)";
          statut = "BLOQUÉE PAR INCERTITUDE";
        }

        if (range) {
          rangeId = range.id;
          sumupLies = await linkSumUpProductsToRange({
            manufacturerId: mfr.id,
            rangeId: range.id,
            rangeName: jr.name,
            productHints: listedHints,
          });
          linkedProducts += sumupLies;

          const online = await prisma.product.count({
            where: { rangeId: range.id, visibleOnline: true },
          });
          visible = online > 0;
          if (online > 0 && (confirmed || sumupLies > 0)) {
            statut = "CORRIGÉE ET COMPLÈTE";
            completedRanges++;
          } else if (rangeId) {
            statut =
              check.verificationStatus === "OFFICIAL_NOT_FOUND"
                ? "SOURCE OFFICIELLE INTROUVABLE"
                : "PARTIELLE";
          }
        }
      } else {
        action = "dry-run (aucune écriture)";
        statut =
          check.verificationStatus === "OFFICIAL_CONFIRMED"
            ? "À CRÉER / COMPLÉTER"
            : check.verificationStatus === "OFFICIAL_NOT_FOUND"
              ? "SOURCE OFFICIELLE INTROUVABLE"
              : "BLOQUÉE PAR INCERTITUDE";
        notes = `${check.verificationStatus} · jsonProducts=${listedHints.length} · empty=${listedHints.length === 0 ? "RECHERCHE_OFFICIELLE" : "liste"}`;
      }

      actions.push({
        fabricant: jm.name,
        gamme: jr.name,
        presenteAvant,
        action,
        produitsOfficielsTrouves: officiels,
        produitsSumUpLies: sumupLies,
        visibleSurSite: visible,
        statut,
        notes,
      });

      console.log(
        `${jm.name} / ${jr.name} → ${statut} (${action}) sumup=${sumupLies} jsonP=${listedHints.length}`
      );
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const reportJson = path.join(outDir, `COMPLETE_RANGES_${stamp}.json`);
  const payload = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    createdRanges,
    completedRanges,
    linkedProducts,
    proposals,
    actions,
  };
  fs.writeFileSync(reportJson, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ mode: payload.mode, createdRanges, completedRanges, linkedProducts, proposals, rows: actions.length }, null, 2));
  console.log(reportJson);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
