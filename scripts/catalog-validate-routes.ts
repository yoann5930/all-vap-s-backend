/**
 * Valide les routes catalogue critiques (structure + données attendues).
 * Exit ≠ 0 si échec.
 */
import prisma from "../lib/prisma";
import { manufacturerLogoUrlIfExists as manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo.server";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";
import fs from "node:fs";
import path from "node:path";

type Issue = string;

async function main() {
  const issues: Issue[] = [];

  // /e-liquides — fabricants avec logo + produits visibles
  const mfrs = await prisma.manufacturer.findMany({
    where: {
      isActive: true,
      status: { in: ["verifie", "partiel"] },
      products: {
        some: {
          visibleOnline: true,
          isActive: true,
          catalogStatus: { in: ["valide", "actif"] },
        },
      },
    },
    select: { id: true, name: true, slug: true },
  });

  for (const m of mfrs) {
    const logo = manufacturerLogoUrl(m.slug);
    if (!logo) {
      issues.push(`ROUTE_/e-liquides: ${m.slug} a des produits visibles mais PAS de logo (case absente)`);
    }
  }

  // Interdiction collection comme gamme sur pages fabricant
  const forbidden = await prisma.productRange.findMany({
    where: {
      isActive: true,
      catalogVisible: true,
      OR: [
        { slug: { contains: "blackout" } },
        { name: { contains: "Call of Vape Blackout", mode: "insensitive" } },
      ],
    },
  });
  for (const f of forbidden) {
    issues.push(
      `ROUTE_/fabricants: gamme indépendante interdite visible: ${f.slug} (${f.name})`
    );
  }

  // Cloud Vapor — Call of Vape ne doit PAS exposer Blackout comme 2e case
  const cv = await prisma.manufacturer.findFirst({
    where: { slug: "cloud-vapor" },
    include: {
      ranges: {
        where: { isActive: true },
        include: {
          collections: true,
          products: {
            where: {
              visibleOnline: true,
              isActive: true,
              catalogStatus: { in: ["valide", "actif"] },
            },
            select: { id: true },
          },
        },
      },
    },
  });
  if (cv) {
    const visibleRanges = cv.ranges.filter((r) => {
      if (r.products.length === 0) return false;
      return isRangeCatalogEligible(
        readRangeOfficialGate(r as unknown as Record<string, unknown>)
      );
    });
    const blackoutAsRange = visibleRanges.find(
      (r) => /blackout/i.test(r.slug) || /blackout/i.test(r.name)
    );
    if (blackoutAsRange) {
      issues.push(
        `CALL_OF_VAPE: Blackout affiché comme gamme indépendante (${blackoutAsRange.slug})`
      );
    }
    const cov = cv.ranges.find((r) => r.slug === "call-of-vape");
    if (cov) {
      const col = cov.collections.find((c) => c.slug === "blackout");
      if (!col) {
        issues.push("CALL_OF_VAPE: collection Blackout absente sous call-of-vape");
      } else if (col.hasOwnRoute) {
        issues.push("CALL_OF_VAPE: Blackout hasOwnRoute=true (interdit)");
      }
    }
  }

  // /gammes — chaque gamme eligible doit avoir cover
  const ranges = await prisma.productRange.findMany({
    where: { isActive: true, catalogVisible: true },
    include: { manufacturer: { select: { slug: true, name: true } } },
  });
  for (const r of ranges) {
    if (!r.manufacturer) continue;
    if (
      !isRangeCatalogEligible(
        readRangeOfficialGate(r as unknown as Record<string, unknown>)
      )
    ) {
      continue;
    }
    const cover = rangeCoverUrl(r.manufacturer.slug, r.slug);
    if (!cover) {
      issues.push(
        `ROUTE_/gammes: cover manquante ${r.manufacturer.slug}/${r.slug}`
      );
    }
  }

  // Référence Cloud Vapor présente dans le JSON
  const refPath = path.resolve(
    "data/catalog/yoann/catalogue-reference-obligatoire.json"
  );
  if (!fs.existsSync(refPath)) {
    issues.push("REFERENCE: catalogue-reference-obligatoire.json manquant");
  } else {
    const ref = JSON.parse(fs.readFileSync(refPath, "utf8"));
    const cloud = ref.manufacturers?.find(
      (m: { slug: string }) => m.slug === "cloud-vapor"
    );
    const cov = cloud?.ranges?.find(
      (r: { slug: string }) => r.slug === "call-of-vape" || /call of vape/i.test(r.name)
    );
    if (!cov?.collections?.some((c: { slug: string }) => c.slug === "blackout")) {
      issues.push(
        "REFERENCE: Blackout doit être collection sous Call of Vape (pas gamme)"
      );
    }
    if (
      cloud?.ranges?.some(
        (r: { name: string }) => /blackout/i.test(r.name) && /call/i.test(r.name)
      )
    ) {
      issues.push(
        "REFERENCE: 'Call of Vape Blackout' encore listé comme gamme indépendante"
      );
    }
  }

  console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
  process.exit(issues.length === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
