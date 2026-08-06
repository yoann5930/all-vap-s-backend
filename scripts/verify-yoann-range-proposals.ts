/**
 * Enregistre / vérifie une liste de gammes proposées par Yoann.
 *
 * Usage:
 *   npx tsx scripts/verify-yoann-range-proposals.ts data/catalog/proposals/exemple.json
 *   npx tsx scripts/verify-yoann-range-proposals.ts data/catalog/proposals/exemple.json --integrate-confirmed
 *
 * Sans --integrate-confirmed : écrit uniquement CatalogRangeProposal + rapport.
 * Avec --integrate-confirmed : crée/met à jour ProductRange SEULEMENT si OFFICIAL_CONFIRMED.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { statusLabelFr } from "../lib/catalog/official-verification";
import { verifyRangeOnOfficialSite } from "../lib/catalog/verify-range-official";

type ProposalFile = {
  manufacturerSlug: string;
  seedUrls?: string[];
  proposedRanges: string[];
  notes?: string;
};

async function main() {
  const fileArg = process.argv[2];
  const integrate = process.argv.includes("--integrate-confirmed");
  if (!fileArg) {
    console.error(
      "Usage: tsx scripts/verify-yoann-range-proposals.ts <fichier.json> [--integrate-confirmed]"
    );
    process.exit(1);
  }

  const abs = path.resolve(fileArg);
  const data = JSON.parse(fs.readFileSync(abs, "utf8")) as ProposalFile;
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { slug: data.manufacturerSlug },
    include: { brands: { take: 1, orderBy: { createdAt: "asc" } } },
  });
  if (!manufacturer) {
    console.error(`Fabricant inconnu: ${data.manufacturerSlug}`);
    process.exit(1);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const proposedName of data.proposedRanges) {
    const check = await verifyRangeOnOfficialSite({
      proposedName,
      manufacturerName: manufacturer.name,
      manufacturerWebsite: manufacturer.website,
      seedUrls: data.seedUrls,
    });

    const proposal = await prisma.catalogRangeProposal.create({
      data: {
        manufacturerId: manufacturer.id,
        proposedName,
        proposedBy: "yoann",
        verificationStatus: check.verificationStatus,
        officialNameFound: check.officialNameFound,
        officialSourceUrl: check.officialSourceUrl,
        officialManufacturerUrl: check.officialManufacturerUrl,
        verifiedAt: new Date(check.verifiedAt),
        evidenceJson: JSON.stringify(check.evidence),
        notes: statusLabelFr(check.verificationStatus),
      },
    });

    let integratedRangeId: string | null = null;

    if (integrate && check.verificationStatus === "OFFICIAL_CONFIRMED") {
      let brandId = manufacturer.brands[0]?.id;
      if (!brandId) {
        const brand = await prisma.brand.create({
          data: {
            name: manufacturer.name,
            slug: `${manufacturer.slug}-brand`,
            manufacturerId: manufacturer.id,
            status: "verifie",
          },
        });
        brandId = brand.id;
      }

      const slug = slugify(check.officialNameFound || proposedName);
      const existing = await prisma.productRange.findFirst({
        where: {
          manufacturerId: manufacturer.id,
          OR: [{ slug }, { name: { equals: proposedName, mode: "insensitive" } }],
        },
      });

      if (existing) {
        await prisma.productRange.update({
          where: { id: existing.id },
          data: {
            verificationStatus: "OFFICIAL_CONFIRMED",
            catalogVisible: true,
            status: "verifie",
            officialSourceUrl: check.officialSourceUrl,
            officialManufacturerUrl: check.officialManufacturerUrl,
            verifiedAt: new Date(check.verifiedAt),
            verificationEvidence: JSON.stringify(check.evidence),
            isActive: true,
          },
        });
        integratedRangeId = existing.id;
      } else {
        const created = await prisma.productRange.create({
          data: {
            brandId,
            manufacturerId: manufacturer.id,
            name: check.officialNameFound || proposedName,
            slug,
            status: "verifie",
            verificationStatus: "OFFICIAL_CONFIRMED",
            catalogVisible: true,
            officialSourceUrl: check.officialSourceUrl,
            officialManufacturerUrl: check.officialManufacturerUrl,
            verifiedAt: new Date(check.verifiedAt),
            verificationEvidence: JSON.stringify(check.evidence),
            isActive: true,
          },
        });
        integratedRangeId = created.id;
      }

      await prisma.catalogRangeProposal.update({
        where: { id: proposal.id },
        data: { integratedRangeId },
      });
    }

    results.push({
      proposedName,
      status: check.verificationStatus,
      label: statusLabelFr(check.verificationStatus),
      officialSourceUrl: check.officialSourceUrl,
      integrated: Boolean(integratedRangeId),
      proposalId: proposal.id,
    });

    console.log(
      `${statusLabelFr(check.verificationStatus)} — ${proposedName}` +
        (integratedRangeId ? " → intégrée" : "")
    );
  }

  const outDir = path.resolve("data/catalog/proposals");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `VERIF_${data.manufacturerSlug}_${Date.now()}.json`
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        manufacturerSlug: data.manufacturerSlug,
        integrate,
        rule: "Liste Yoann = recherche seulement. Intégration uniquement si OFFICIAL_CONFIRMED + --integrate-confirmed.",
        results,
      },
      null,
      2
    )
  );
  console.log("Rapport:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
