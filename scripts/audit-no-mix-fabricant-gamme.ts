/**
 * AUDIT OBLIGATOIRE — dossiers images → fabricant → gamme → produit
 * Détecte les mélanges fabricant/gamme et les mauvais placements.
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type FolderSpec = {
  source: string;
  mfrSlug: string;
  mfrName: string;
  rangeSlug: string;
  rangeName: string;
  /** extract flavor key from filename */
  parseFlavor: (file: string) => string;
};

const FOLDERS: FolderSpec[] = [
  {
    source: "C:\\Users\\ASUS\\Pictures\\liquidarom\\ice cool",
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "ice-cool",
    rangeName: "Ice Cool",
    parseFlavor: (f) =>
      norm(
        path
          .basename(f, path.extname(f))
          .replace(/^e-liquide-/, "")
          .replace(/-50ml-ice-cool$/i, ""),
      ),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\liquidarom\\ice cool x",
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "ice-cool-x",
    rangeName: "Ice Cool X",
    parseFlavor: (f) =>
      norm(
        path
          .basename(f, path.extname(f))
          .replace(/^e-liquide-/, "")
          .replace(/-50ml-ice-cool-x$/i, ""),
      ),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\liquidarom\\les collegues",
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "les-collegues",
    rangeName: "Les Collègues",
    parseFlavor: (f) =>
      norm(
        path
          .basename(f, path.extname(f))
          .replace(/^e-liquide-/, "")
          .replace(/-50ml-les-collegues$/i, ""),
      ),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\liquidarom\\les essentiels",
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "les-essentiels",
    rangeName: "Les Essentiels",
    parseFlavor: (f) =>
      norm(
        path
          .basename(f, path.extname(f))
          .replace(/^e-liquide-/, "")
          .replace(/-50ml-les-essentiels$/i, ""),
      ),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\liquidarom\\replay",
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "replay",
    rangeName: "Replay",
    parseFlavor: (f) =>
      norm(
        path
          .basename(f, path.extname(f))
          .replace(/^e-liquide-replay-/, "")
          .replace(/-100ml-liquidarom$/i, ""),
      ),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\cloud vapor\\call of vape",
    mfrSlug: "cloud-vapor",
    mfrName: "Cloud Vapor",
    rangeSlug: "call-of-vape",
    rangeName: "Call of Vape",
    parseFlavor: (f) =>
      norm(
        path
          .basename(f, path.extname(f))
          .replace(/-100ml-call of vape$/i, "")
          .replace(/-100ml-call-of-vape$/i, ""),
      ),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\cloud vapor\\hellfest",
    mfrSlug: "cloud-vapor",
    mfrName: "Cloud Vapor",
    rangeSlug: "hellfest",
    rangeName: "Hellfest",
    parseFlavor: (f) => norm(path.basename(f, path.extname(f)).replace(/-50ml$/i, "")),
  },
  {
    source: "C:\\Users\\ASUS\\Pictures\\cloud vapor\\kung freeze",
    mfrSlug: "cloud-vapor",
    mfrName: "Cloud Vapor",
    rangeSlug: "kung-freeze",
    rangeName: "Kung Freeze",
    parseFlavor: (f) => norm(path.basename(f, path.extname(f)).replace(/-50ml$/i, "")),
  },
];

function listImages(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => path.join(dir, f));
}

async function main() {
  const mfrs = await prisma.manufacturer.findMany({
    where: { slug: { in: ["liquidarom", "cloud-vapor"] } },
    select: { id: true, slug: true, name: true },
  });
  const mfrBySlug = Object.fromEntries(mfrs.map((m) => [m.slug, m]));

  const ranges = await prisma.productRange.findMany({
    where: {
      OR: [
        { manufacturerId: { in: mfrs.map((m) => m.id) } },
        {
          slug: {
            in: FOLDERS.map((f) => f.rangeSlug),
          },
        },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      manufacturerId: true,
      catalogVisible: true,
    },
  });

  const report: any = {
    date: new Date().toISOString(),
    folders: [] as any[],
    crossContamination: [] as any[],
    wrongManufacturer: [] as any[],
    wrongRange: [] as any[],
    rangeManufacturerMismatch: [] as any[],
  };

  // Range belonging to wrong manufacturer
  for (const folder of FOLDERS) {
    const mfr = mfrBySlug[folder.mfrSlug];
    const range = ranges.find((r) => r.slug === folder.rangeSlug);
    if (range && mfr && range.manufacturerId !== mfr.id) {
      report.rangeManufacturerMismatch.push({
        range: range.slug,
        expectedMfr: folder.mfrSlug,
        actualMfrId: range.manufacturerId,
      });
    }
  }

  for (const folder of FOLDERS) {
    const mfr = mfrBySlug[folder.mfrSlug];
    const range = ranges.find(
      (r) => r.slug === folder.rangeSlug && (!mfr || r.manufacturerId === mfr.id),
    );
    const files = listImages(folder.source);
    const entry: any = {
      source: folder.source,
      expected: `${folder.mfrName} → ${folder.rangeName}`,
      mfrOk: !!mfr,
      rangeOk: !!range && range.manufacturerId === mfr?.id,
      rangeId: range?.id || null,
      files: files.length,
      flavors: files.map((f) => folder.parseFlavor(f)),
      productsInRange: [] as any[],
      issues: [] as any[],
    };

    if (!mfr || !range) {
      entry.issues.push(!mfr ? "mfr_missing" : "range_missing_or_wrong_mfr");
      report.folders.push(entry);
      continue;
    }

    // All products currently on this range
    const onRange = await prisma.product.findMany({
      where: { rangeId: range.id },
      select: {
        id: true,
        name: true,
        manufacturerId: true,
        brand: true,
        range: true,
        rangeId: true,
        imageUrl: true,
        stock: true,
        visibleOnline: true,
        productType: true,
        productFamily: true,
      },
      orderBy: { name: "asc" },
    });

    for (const p of onRange) {
      const row = {
        name: p.name,
        mfrOk: p.manufacturerId === mfr.id,
        rangeLabelOk: p.range === folder.rangeName,
        hasImage: !!p.imageUrl,
        stock: p.stock,
        vis: p.visibleOnline,
        type: p.productType,
      };
      entry.productsInRange.push(row);
      if (p.manufacturerId !== mfr.id) {
        report.wrongManufacturer.push({
          productId: p.id,
          name: p.name,
          expectedMfr: folder.mfrSlug,
          range: folder.rangeSlug,
        });
        entry.issues.push(`wrong_mfr:${p.name}`);
      }
      if (p.range && p.range !== folder.rangeName) {
        report.wrongRange.push({
          productId: p.id,
          name: p.name,
          expectedRange: folder.rangeName,
          actualRange: p.range,
        });
        entry.issues.push(`wrong_range_label:${p.name}`);
      }
    }

    // Detect foreign products that mention this range but belong elsewhere
    const namedLike = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: folder.rangeName, mode: "insensitive" } },
          { range: { equals: folder.rangeName, mode: "insensitive" } },
        ],
        NOT: { rangeId: range.id },
      },
      select: {
        id: true,
        name: true,
        manufacturerId: true,
        range: true,
        rangeId: true,
        brand: true,
      },
      take: 50,
    });
    for (const p of namedLike) {
      // Ice Cool X contains "Ice Cool" — pas un mélange
      if (folder.rangeSlug === "ice-cool" && /ice\s*cool\s*x/i.test(p.name + " " + (p.range || ""))) {
        continue;
      }
      // ignore if clearly another mfr's homonym (Les Essentiels Liquideo)
      if (folder.rangeSlug === "les-essentiels" && p.manufacturerId !== mfr.id) {
        entry.issues.push(`foreign_essentiels_other_mfr:${p.name}`);
        continue;
      }
      report.crossContamination.push({
        productId: p.id,
        name: p.name,
        expected: `${folder.mfrSlug}/${folder.rangeSlug}`,
        actualRangeId: p.rangeId,
        actualRange: p.range,
        actualMfrId: p.manufacturerId,
      });
      entry.issues.push(`orphan_or_misplaced:${p.name}`);
    }

    report.folders.push(entry);
  }

  // Global: liquidarom products with cloud vapor range names / vice versa
  const liquidarom = mfrBySlug["liquidarom"];
  const cloud = mfrBySlug["cloud-vapor"];
  if (liquidarom && cloud) {
    const mixed = await prisma.product.findMany({
      where: {
        OR: [
          {
            manufacturerId: liquidarom.id,
            OR: [
              { range: { in: ["Call of Vape", "Hellfest", "Kung Freeze"] } },
              { name: { contains: "Cloud Vapor", mode: "insensitive" } },
            ],
          },
          {
            manufacturerId: cloud.id,
            OR: [
              { range: { in: ["Ice Cool", "Ice Cool X", "Les Collègues", "Les Essentiels", "Replay"] } },
              { name: { contains: "Liquidarom", mode: "insensitive" } },
            ],
          },
        ],
      },
      select: { id: true, name: true, manufacturerId: true, range: true, rangeId: true },
    });
    for (const p of mixed) {
      report.crossContamination.push({
        type: "mfr_range_cross",
        productId: p.id,
        name: p.name,
        manufacturerId: p.manufacturerId,
        range: p.range,
      });
    }
  }

  const out = path.resolve("data/rebuild/AUDIT_NO_MIX_FABRICANT_GAMME.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        folders: report.folders.map((f: any) => ({
          expected: f.expected,
          files: f.files,
          products: f.productsInRange.length,
          mfrOk: f.mfrOk,
          rangeOk: f.rangeOk,
          issues: f.issues.length,
          issueSamples: f.issues.slice(0, 5),
        })),
        wrongManufacturer: report.wrongManufacturer.length,
        wrongRange: report.wrongRange.length,
        crossContamination: report.crossContamination.length,
        rangeManufacturerMismatch: report.rangeManufacturerMismatch.length,
        report: out,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
