/**
 * Audit Liquidarom — CSV, images, base locale (sans modification).
 * Usage: npx tsx scripts/audit-liquidarom.ts [--env .env]
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseSemicolonCsv } from "../lib/catalog/liquidarom-import";
import { isGroupPhotoUrl } from "../lib/catalog/images";

function loadDatabaseUrl(envPath: string): string | null {
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, "utf8");
  const m = raw.match(/^DATABASE_URL=(.*)$/m);
  if (!m) return null;
  let url = m[1].trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1);
  }
  if (!/^postgres(ql)?:\/\//.test(url)) return null;
  return url;
}

function walkImages(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(full, acc);
    else if (/\.(webp|jpg|jpeg|png)$/i.test(entry.name)) acc.push(full.replace(/\\/g, "/"));
  }
  return acc;
}

async function auditDb(url: string | null) {
  if (!url) {
    return {
      connected: false,
      reason: "DATABASE_URL absente ou invalide",
      total: 0,
      liquidarom: 0,
      liquidaromVisible: 0,
      withoutImage: 0,
      withGroupImage: 0,
      duplicates: [] as string[],
    };
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    const products = await prisma.product.findMany({
      where: { brand: { equals: "Liquidarom", mode: "insensitive" } },
      select: {
        id: true,
        sku: true,
        reference: true,
        name: true,
        slug: true,
        imageUrl: true,
        imageStatus: true,
        visibleOnline: true,
        isActive: true,
        range: true,
        catalogImages: { select: { url: true, status: true } },
      },
    });

    const visible = products.filter((p) => p.isActive && p.visibleOnline);
    const withoutImage = products.filter((p) => {
      const urls = [
        p.imageUrl,
        ...p.catalogImages.map((i) => i.url),
      ].filter(Boolean) as string[];
      const single = urls.filter((u) => !isGroupPhotoUrl(u));
      return single.length === 0;
    });
    const withGroup = products.filter((p) => {
      const urls = [p.imageUrl, ...p.catalogImages.map((i) => i.url)].filter(Boolean) as string[];
      return urls.some((u) => isGroupPhotoUrl(u)) && urls.every((u) => isGroupPhotoUrl(u) || !u);
    });

    const bySku = new Map<string, string[]>();
    for (const p of products) {
      const key = p.sku || p.reference || p.slug;
      if (!bySku.has(key)) bySku.set(key, []);
      bySku.get(key)!.push(p.name);
    }
    const duplicates = [...bySku.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([key, names]) => ({ key, names }));

    return {
      connected: true,
      total: products.length,
      liquidarom: products.length,
      liquidaromVisible: visible.length,
      withoutImage: withoutImage.length,
      withGroupImage: withGroup.length,
      duplicates,
      sample: products.slice(0, 5).map((p) => ({
        sku: p.sku,
        name: p.name,
        imageUrl: p.imageUrl,
        imageStatus: p.imageStatus,
        visibleOnline: p.visibleOnline,
      })),
    };
  } catch (err) {
    return {
      connected: false,
      reason: err instanceof Error ? err.message : String(err),
      total: 0,
      liquidarom: 0,
      liquidaromVisible: 0,
      withoutImage: 0,
      withGroupImage: 0,
      duplicates: [] as string[],
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const envArg = process.argv.find((a) => a.startsWith("--env="))?.split("=")[1] || ".env";
  const root = process.cwd();
  const csvPath = path.join(root, "data/liquidarom/All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv");
  const avaPath = path.join(root, "data/liquidarom/All_Vaps_Profils_Saveurs_AVA_MAJ_Liquidarom.csv");
  const dlBase =
    "c:/Users/Hyorin/Downloads/ALLVAPS_LIQUIDAROM_OFFICIAL_IMAGES/ALLVAPS_LIQUIDAROM_OFFICIAL_IMAGES";
  const dlCsv = path.join(dlBase, "All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv");

  const products = parseSemicolonCsv(fs.readFileSync(csvPath, "utf8"));
  const ava = parseSemicolonCsv(fs.readFileSync(avaPath, "utf8"));
  const dlProducts = fs.existsSync(dlCsv) ? parseSemicolonCsv(fs.readFileSync(dlCsv, "utf8")) : [];

  const groupPhotos = new Map<string, number>();
  for (const p of products) {
    const photo = p["Photo face"] || "(vide)";
    groupPhotos.set(photo, (groupPhotos.get(photo) || 0) + 1);
  }

  const ranges: Record<string, number> = {};
  for (const p of products) {
    const r = p["Sous-catégorie"] || "unknown";
    ranges[r] = (ranges[r] || 0) + 1;
  }

  const imageDirs = [
    "public/images/products/liquidarom",
    "public/products/liquidarom",
  ];
  const allImages = imageDirs.flatMap((d) => walkImages(path.join(root, d)));
  const individualImages = allImages.filter((u) => !isGroupPhotoUrl(u));
  const groupImages = allImages.filter((u) => isGroupPhotoUrl(u));

  const priorityReview = products
    .filter((p) => {
      const name = (p["Nom commercial"] || "").toLowerCase();
      const notes = (p["Notes internes"] || "").toLowerCase();
      const keywords = [
        "framboise des bois",
        "cactus",
        "pastis",
        "miss blue",
        "grenade",
        "collègues",
        "essentiels",
        "collector",
        "ice cool",
      ];
      return keywords.some((k) => name.includes(k)) || notes.includes("confirmer");
    })
    .map((p) => ({
      id: p["ID produit"],
      name: p["Nom commercial"],
      range: p["Sous-catégorie"],
      photo: p["Photo face"],
      notes: p["Notes internes"],
      status: notesStatus(p),
    }));

  const db = await auditDb(loadDatabaseUrl(path.join(root, envArg)));

  const report = {
    generatedAt: new Date().toISOString(),
    projectPath: root,
    dataSource: {
      primary: "PostgreSQL via Prisma (Product, ProductVariant, ProductFlavor, ProductImage, ProductAvaMeta)",
      importCsv: "data/liquidarom/*.csv",
      importScripts: [
        "scripts/import-liquidarom-products.ts",
        "lib/catalog/liquidarom-import.ts",
        "lib/catalog/import-unified.ts",
      ],
      imageResolution: "lib/catalog/images.ts → resolveProductImage()",
    },
    prismaFields: {
      brand: "Product.brand / brandId → Brand",
      range: "Product.range / rangeId → ProductRange",
      flavors: "ProductFlavor (primaryFlavor, secondaryFlavor, isFresh, …)",
      image: "Product.imageUrl + ProductImage.url + imageStatus",
      slug: "Product.slug (unique)",
      reference: "Product.reference + Product.sku (AV-xxxx)",
      visibility: "Product.isActive + Product.visibleOnline",
      stock: "Product.stock + StockLevel par boutique",
      ava: "ProductAvaMeta (interne) + ProductFlavor.searchKeywords",
      sumup: "sumupProductId, sumupVariantId, sumupName, sumupReference, sumupSku",
    },
    counts: {
      csvProducts: products.length,
      csvAvaProfiles: ava.length,
      downloadsCsvProducts: dlProducts.length,
      backendCsvMatchesDownloads:
        dlProducts.length === products.length &&
        JSON.stringify(dlProducts.map((p) => p["ID produit"])) ===
          JSON.stringify(products.map((p) => p["ID produit"])),
      csvActiveOnline: products.filter((p) => (p["Actif en ligne"] || "").toLowerCase() === "oui").length,
      csvActiveBoutique: products.filter((p) => (p["Actif en boutique"] || "").toLowerCase() === "oui").length,
      csvWithoutPrice: products.filter(
        (p) => !p["Prix vente TTC (€)"] || p["Prix vente TTC (€)"].startsWith("=")
      ).length,
      csvWithoutBarcode: products.filter((p) => !p["Code-barres / SKU"]).length,
      csvAllUseGroupPhotos: products.every((p) => {
        const photo = p["Photo face"] || "";
        return !photo || isGroupPhotoUrl(photo) || /^image-\d+\.jpg$/i.test(photo);
      }),
      csvGroupPhotoDistribution: Object.fromEntries(groupPhotos),
      ranges,
      individualImagesInPublic: individualImages.length,
      groupImagesInPublic: groupImages.length,
      individualImagePaths: individualImages,
      groupImagePaths: groupImages,
      database: db,
    },
    gaps: {
      workingFolderMissing: !fs.existsSync("D:/all vaps/ALLVAPS_LIQUIDAROM_OFFICIAL_IMAGES"),
      workingFolderInDownloads: fs.existsSync(dlBase),
      noIndividualProductImages: individualImages.length === 0,
      allCsvPhotosAreGroupRefs: true,
      importDoesNotSetImages: true,
      localDbEmpty: db.connected && db.liquidarom === 0,
    },
    avaProfilesToReview: ava
      .filter((a) => /vérifier|confirmer/i.test(a["Statut validation"] || ""))
      .map((a) => ({ id: a["ID produit"], name: a["Nom produit"], status: a["Statut validation"] })),
    priorityProductsForVerification: priorityReview,
    productList: products.map((p) => ({
      id: p["ID produit"],
      name: p["Nom commercial"],
      range: p["Sous-catégorie"],
      format: p["Format / Contenance"],
      nicotine: p["Taux nicotine (mg/ml)"],
      pgvg: p["Ratio PG/VG"],
      photo: p["Photo face"],
      activeOnline: p["Actif en ligne"],
      verificationStatus: notesStatus(p),
    })),
  };

  const outPath = path.join(root, "data/liquidarom/AUDIT_REPORT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`\n[audit] Rapport écrit: ${outPath}`);
}

function notesStatus(p: Record<string, string>): string {
  const notes = (p["Notes internes"] || "").toLowerCase();
  if (notes.includes("identification depuis photo de rayon")) return "to_review";
  if (notes.includes("à confirmer") || notes.includes("confirmer")) return "to_review";
  if (notes.includes("déduites du visuel")) return "to_review";
  return "verified";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
