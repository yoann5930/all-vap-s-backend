/**
 * Valide logos fabricants + covers gammes publiées (fichier + lisibilité).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { manufacturerLogoUrlIfExists as manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo.server";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";

async function checkImage(
  abs: string,
  opts: { minBytes: number; minMean?: number }
): Promise<string | null> {
  if (!fs.existsSync(abs)) return "FILE_MISSING";
  const size = fs.statSync(abs).size;
  if (size < opts.minBytes) return `TOO_SMALL(${size})`;
  try {
    const stats = await sharp(abs).stats();
    const mean =
      (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    if (opts.minMean != null && mean < opts.minMean) return `LOW_CONTRAST(${mean.toFixed(1)})`;
  } catch {
    return "UNREADABLE";
  }
  return null;
}

async function main() {
  const issues: string[] = [];

  const mfrs = await prisma.manufacturer.findMany({
    where: { isActive: true },
    select: { slug: true, name: true },
  });

  for (const m of mfrs) {
    const url = manufacturerLogoUrl(m.slug);
    if (!url) continue; // absence traitée par audit strict vs référence
    const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
    const err = await checkImage(abs, { minBytes: 800, minMean: 5 });
    if (err) issues.push(`LOGO ${m.slug}: ${err}`);

    if (m.slug === "vape-47") {
      const bak = path.join(
        process.cwd(),
        "public/media/manufacturers/vape-47/logo.WRONG-prestashop-mystore.webp.bak"
      );
      if (fs.existsSync(bak) && fs.existsSync(abs)) {
        if (Buffer.compare(fs.readFileSync(abs), fs.readFileSync(bak)) === 0) {
          issues.push("LOGO vape-47: encore le placeholder PrestaShop my store");
        }
      }
    }
  }

  const ranges = await prisma.productRange.findMany({
    where: { isActive: true },
    include: { manufacturer: { select: { slug: true } } },
  });
  for (const r of ranges) {
    if (!r.manufacturer) continue;
    const eligible = isRangeCatalogEligible(
      readRangeOfficialGate(r as unknown as Record<string, unknown>)
    );
    if (!eligible) continue;
    const url = rangeCoverUrl(r.manufacturer.slug, r.slug);
    if (!url) {
      issues.push(`COVER missing ${r.manufacturer.slug}/${r.slug}`);
      continue;
    }
    const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
    const err = await checkImage(abs, { minBytes: 2500, minMean: 10 });
    if (err) issues.push(`COVER ${r.manufacturer.slug}/${r.slug}: ${err}`);
  }

  console.log(JSON.stringify({ ok: issues.length === 0, count: issues.length, issues }, null, 2));
  process.exit(issues.length === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
