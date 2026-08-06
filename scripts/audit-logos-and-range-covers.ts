/**
 * Audit obligation : logos fabricants + covers gammes.
 * Dry-run par défaut.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";

async function main() {
  const manufacturers = await prisma.manufacturer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      ranges: {
        where: { isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });

  const mfrMissing: string[] = [];
  const mfrOk: string[] = [];
  const rangeMissing: Array<{ mfr: string; range: string; slug: string }> = [];
  const rangeOk: Array<{ mfr: string; range: string }> = [];
  const publishedMissingCover: Array<{ mfr: string; range: string }> = [];

  for (const m of manufacturers) {
    const logo = manufacturerLogoUrl(m.slug);
    if (logo) mfrOk.push(`${m.name} (${m.slug}) → ${logo}`);
    else mfrMissing.push(`${m.name} (${m.slug}) website=${m.website || "—"}`);

    for (const r of m.ranges) {
      const cover = rangeCoverUrl(m.slug, r.slug);
      const gate = readRangeOfficialGate(r as unknown as Record<string, unknown>);
      const eligible = isRangeCatalogEligible({
        verificationStatus: gate.verificationStatus,
        catalogVisible: gate.catalogVisible,
        isActive: gate.isActive,
        legacyStatus: gate.legacyStatus,
      });
      if (cover) rangeOk.push({ mfr: m.slug, range: r.slug });
      else {
        rangeMissing.push({ mfr: m.slug, range: r.name, slug: r.slug });
        if (eligible) publishedMissingCover.push({ mfr: m.slug, range: `${r.name} (${r.slug})` });
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    manufacturersTotal: manufacturers.length,
    logosOk: mfrOk.length,
    logosMissing: mfrMissing.length,
    rangesTotal: rangeOk.length + rangeMissing.length,
    coversOk: rangeOk.length,
    coversMissing: rangeMissing.length,
    publishedMissingCover: publishedMissingCover.length,
    mfrMissing,
    mfrOk,
    publishedMissingCover,
    rangeMissing: rangeMissing.slice(0, 200),
  };
  fs.writeFileSync(
    path.join(outDir, `AUDIT_LOGOS_COVERS_${stamp}.json`),
    JSON.stringify(payload, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        manufacturersTotal: payload.manufacturersTotal,
        logosOk: payload.logosOk,
        logosMissing: payload.logosMissing,
        coversOk: payload.coversOk,
        coversMissing: payload.coversMissing,
        publishedMissingCover: payload.publishedMissingCover,
        mfrMissing,
        publishedMissingCoverList: publishedMissingCover,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
