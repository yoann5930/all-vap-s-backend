/**
 * Intègre photos Liquidarom (Collègues / Essentiels / Replay) + Cloud Vapor (Call of Vape)
 * et normalise les noms : Fabricant → Gamme → Produit.
 *
 * - Dédup : garde SumUp, transfère stock, purge doublons sans SumUp
 * - Style e-tasty obligatoire
 * - Ne touche PAS stock (sauf transfert vers keeper), covers gamme, Ice Cool, Pastis 13 photo si pas dans dossier
 * - bloodmon ignoré (doute)
 *
 * Usage:
 *   npx tsx scripts/implant-liquidarom-cloud-remaining.ts --dry-run
 *   npx tsx scripts/implant-liquidarom-cloud-remaining.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeProductImageToEtastyStyle } from "../lib/catalog/normalize-product-image";
import { quarantineDuplicateProduct } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/IMPLANT_LIQUIDAROM_CLOUD_REMAINING.json");

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(key: string) {
  const special: Record<string, string> = {
    "la-coquette": "La Coquette",
    "la-mimi": "La Mimi",
    "le-baleze": "Le Balèze",
    "le-charmeur": "Le Charmeur",
    "le-chocostar": "Le ChocoStar",
    "le-flambeur": "Le Flambeur",
    "le-funkie": "Le Funkie",
    "le-tchatcheur": "Le Tchatcheur",
    "le-p-tit-blond": "Le P'tit Blond",
    "ptit-blond": "Le P'tit Blond",
    "mojito-des-iles": "Mojito des îles",
    eleven: "Eleven",
    harry: "Harry",
    "joueur-01": "Joueur 01",
    "l-aventurier": "L'Aventurier",
    mercredi: "Mercredi",
    sacha: "Sacha",
    tokyo: "Tokyo",
    assault: "Assault",
    blackout: "Blackout",
    crimson: "Crimson",
    ghost: "Ghost",
    operator: "Operator",
    prestige: "Prestige",
    scout: "Scout",
    support: "Support",
    zombie: "Zombie",
    "blue-rasphell": "Blue Rasphell",
    "cherry-devil": "Cherry Devil",
    "dragon-blast": "Dragon Blast",
    black: "Black",
    dragon: "Dragon",
    midnight: "Midnight",
    red: "Red",
    sunlight: "Sunlight",
    sunrise: "Sunrise",
    sunset: "Sunset",
  };
  if (special[key]) return special[key];
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function productDisplayName(mfrName: string, rangeName: string, flavorKey: string, formatLabel: string) {
  // Fabricant → Gamme → Produit (nom catalogue propre)
  return `${mfrName} — ${rangeName} — ${titleCase(flavorKey)} ${formatLabel}`;
}

async function ensureBrand(manufacturerId: string, name: string, slug: string) {
  let brand = await prisma.brand.findFirst({
    where: { OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }, { manufacturerId }] },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: { name, slug, manufacturerId, status: "verifie", isActive: true },
    });
  } else if (!brand.manufacturerId) {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: { manufacturerId },
    });
  }
  return brand;
}

async function ensureRange(
  manufacturerId: string,
  brandId: string,
  name: string,
  slug: string,
  formatCodes: string[],
) {
  let range = await prisma.productRange.findFirst({
    where: {
      manufacturerId,
      OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }],
    },
  });
  if (!range) {
    range = await prisma.productRange.create({
      data: {
        name,
        slug,
        brandId,
        manufacturerId,
        formatCodes,
        status: "verifie",
        verificationStatus: "OFFICIAL_CONFIRMED",
        catalogVisible: true,
        isActive: true,
        masterId: `RNG-${slug.includes("cloud") || manufacturerId ? "mfr" : "mfr"}-${slug.replace(/-/g, "_")}`.slice(0, 60),
      },
    });
  } else {
    range = await prisma.productRange.update({
      where: { id: range.id },
      data: {
        manufacturerId,
        catalogVisible: true,
        isActive: true,
        status: "verifie",
        verificationStatus: "OFFICIAL_CONFIRMED",
        formatCodes: range.formatCodes?.length ? range.formatCodes : formatCodes,
      },
    });
  }
  return range;
}

async function transferStock(fromId: string, toId: string) {
  const levels = await prisma.stockLevel.findMany({ where: { productId: fromId } });
  if (!levels.length) return 0;
  let keeperVariant = await prisma.productVariant.findFirst({
    where: { productId: toId },
    orderBy: { createdAt: "asc" },
  });
  if (!keeperVariant) {
    const donor = await prisma.productVariant.findFirst({ where: { productId: fromId } });
    keeperVariant = await prisma.productVariant.create({
      data: {
        productId: toId,
        name: donor?.name || "Standard",
        sku: donor?.sku || null,
        barcode: donor?.barcode || null,
        capacityMl: donor?.capacityMl ?? null,
        sumupVariantId: donor?.sumupVariantId || null,
      },
    });
  }
  let qty = 0;
  for (const lvl of levels) {
    const existing = await prisma.stockLevel.findFirst({
      where: { productId: toId, locationId: lvl.locationId, variantId: keeperVariant.id },
    });
    if (existing) {
      const quantity = existing.quantity + lvl.quantity;
      const reservedQuantity = existing.reservedQuantity + lvl.reservedQuantity;
      await prisma.stockLevel.update({
        where: { id: existing.id },
        data: {
          quantity,
          reservedQuantity,
          availableQuantity: Math.max(0, quantity - reservedQuantity),
        },
      });
      await prisma.stockLevel.delete({ where: { id: lvl.id } });
    } else {
      await prisma.stockLevel.update({
        where: { id: lvl.id },
        data: { productId: toId, variantId: keeperVariant.id },
      });
    }
    qty += lvl.quantity;
  }
  return qty;
}

async function setProductPhoto(productId: string, publicUrl: string, alt: string) {
  const img = await prisma.productImage.findFirst({
    where: { productId, sortOrder: 0 },
  });
  if (img) {
    await prisma.productImage.update({
      where: { id: img.id },
      data: { url: publicUrl, status: "official", alt },
    });
  } else {
    await prisma.productImage.create({
      data: { productId, url: publicUrl, status: "official", sortOrder: 0, alt },
    });
  }
}

type FlavorSpec = {
  flavor: string;
  aliases: string[];
  file: string;
  format: "50ml" | "100ml";
};

type Job = {
  mfrSlug: string;
  mfrName: string;
  rangeSlug: string;
  rangeName: string;
  sourceDir: string;
  mediaSubdir: string;
  formatCodes: string[];
  flavors: FlavorSpec[];
  productFilter: (name: string) => boolean;
};

const JOBS: Job[] = [
  {
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "les-collegues",
    rangeName: "Les Collègues",
    sourceDir: "C:\\Users\\ASUS\\Pictures\\liquidarom\\les collegues",
    mediaSubdir: "liquidarom/les-collegues",
    formatCodes: ["50ml"],
    productFilter: (n) => /collegue|collègue|coquette|mimi|baleze|balèze|charmeur|chocostar|flambeur|funkie|tchatcheur/i.test(n),
    flavors: [
      { flavor: "la-coquette", aliases: ["coquette"], file: "e-liquide-la-coquette-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "la-mimi", aliases: ["mimi"], file: "e-liquide-la-mimi-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "le-baleze", aliases: ["baleze", "balèze"], file: "e-liquide-le-baleze-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "le-charmeur", aliases: ["charmeur"], file: "e-liquide-le-charmeur-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "le-chocostar", aliases: ["chocostar", "choco-star"], file: "e-liquide-le-chocostar-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "le-flambeur", aliases: ["flambeur"], file: "e-liquide-le-flambeur-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "le-funkie", aliases: ["funkie"], file: "e-liquide-le-funkie-50ml-les-collegues.jpg", format: "50ml" },
      { flavor: "le-tchatcheur", aliases: ["tchatcheur"], file: "e-liquide-le-tchatcheur-50ml-les-collegues.jpg", format: "50ml" },
    ],
  },
  {
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "les-essentiels",
    rangeName: "Les Essentiels",
    sourceDir: "C:\\Users\\ASUS\\Pictures\\liquidarom\\les essentiels",
    mediaSubdir: "liquidarom/les-essentiels",
    formatCodes: ["50ml"],
    productFilter: (n) => /essentiel|ptit blond|p'?tit blond|mojito/i.test(n) && !/pastis/i.test(n),
    flavors: [
      {
        flavor: "le-p-tit-blond",
        aliases: ["ptit-blond", "p-tit-blond", "petit-blond"],
        file: "e-liquide-le-p-tit-blond-50ml-les-essentiels.jpg",
        format: "50ml",
      },
      {
        flavor: "mojito-des-iles",
        aliases: ["mojito"],
        file: "e-liquide-mojito-des-iles-50ml-les-essentiels.jpg",
        format: "50ml",
      },
    ],
  },
  {
    mfrSlug: "liquidarom",
    mfrName: "Liquidarom",
    rangeSlug: "replay",
    rangeName: "Replay",
    sourceDir: "C:\\Users\\ASUS\\Pictures\\liquidarom\\replay",
    mediaSubdir: "liquidarom/replay",
    formatCodes: ["100ml"],
    productFilter: (n) => /replay/i.test(n),
    flavors: [
      { flavor: "eleven", aliases: ["eleven"], file: "e-liquide-replay-eleven-100ml-liquidarom.jpg", format: "100ml" },
      { flavor: "harry", aliases: ["harry"], file: "e-liquide-replay-harry-100ml-liquidarom.jpg", format: "100ml" },
      { flavor: "joueur-01", aliases: ["joueur-01", "joueur"], file: "e-liquide-replay-joueur-01-100ml-liquidarom.jpg", format: "100ml" },
      {
        flavor: "l-aventurier",
        aliases: ["aventurier"],
        file: "e-liquide-replay-l-aventurier-100ml-liquidarom.jpg",
        format: "100ml",
      },
      { flavor: "mercredi", aliases: ["mercredi"], file: "e-liquide-replay-mercredi-100ml-liquidarom.jpg", format: "100ml" },
      { flavor: "sacha", aliases: ["sacha"], file: "e-liquide-replay-sacha-100ml-liquidarom.jpg", format: "100ml" },
      { flavor: "tokyo", aliases: ["tokyo"], file: "e-liquide-replay-tokyo-100ml-liquidarom.jpg", format: "100ml" },
    ],
  },
  {
    mfrSlug: "cloud-vapor",
    mfrName: "Cloud Vapor",
    rangeSlug: "call-of-vape",
    rangeName: "Call of Vape",
    sourceDir: "C:\\Users\\ASUS\\Pictures\\cloud vapor\\call of vape",
    mediaSubdir: "cloud-vapor/call-of-vape",
    formatCodes: ["100ml"],
    productFilter: (n) => /call\s*of\s*vape/i.test(n) && /100\s*ml/i.test(n) && !/concentr/i.test(n),
    flavors: [
      { flavor: "assault", aliases: ["assault"], file: "assault-100ml-call of vape.webp", format: "100ml" },
      { flavor: "blackout", aliases: ["blackout"], file: "blackout-100ml-call of vape.webp", format: "100ml" },
      { flavor: "crimson", aliases: ["crimson"], file: "crimson-100ml-call of vape.webp", format: "100ml" },
      { flavor: "ghost", aliases: ["ghost"], file: "ghost-100ml-call of vape.webp", format: "100ml" },
      { flavor: "operator", aliases: ["operator"], file: "operator-100ml-call of vape.webp", format: "100ml" },
      { flavor: "prestige", aliases: ["prestige"], file: "prestige-100ml-call of vape.webp", format: "100ml" },
      { flavor: "scout", aliases: ["scout"], file: "scout-100ml-call of vape.webp", format: "100ml" },
      { flavor: "support", aliases: ["support"], file: "support-100ml-call of vape.webp", format: "100ml" },
      { flavor: "zombie", aliases: ["zombie"], file: "zombie-100ml-call of vape.webp", format: "100ml" },
    ],
  },
];

function matchScore(productName: string, aliases: string[], format: string) {
  const n = norm(productName);
  if (format === "100ml" && !/100ml|100-ml/.test(n) && !/\b100\b/.test(productName)) return 0;
  if (format === "50ml" && /100ml|100-ml/.test(n)) return 0;
  if (/concentr/.test(n)) return 0;
  let best = 0;
  for (const a of aliases) {
    const al = norm(a);
    if (!al) continue;
    if (n.includes(al)) best = Math.max(best, al.length >= 5 ? 0.95 : 0.85);
  }
  return best;
}

async function implantJob(job: Job, report: any) {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: job.mfrSlug } });
  if (!mfr) throw new Error(`mfr ${job.mfrSlug} missing`);
  const brand = await ensureBrand(mfr.id, job.mfrName, job.mfrSlug);
  const range = await ensureRange(mfr.id, brand.id, job.rangeName, job.rangeSlug, job.formatCodes);

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { manufacturerId: mfr.id },
        { name: { contains: job.rangeName.split(" ")[0], mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      stock: true,
      imageUrl: true,
      sumupProductId: true,
      visibleOnline: true,
      rangeId: true,
      range: true,
      manufacturerId: true,
      productType: true,
      productFamily: true,
    },
  });

  const pool = products.filter((p) => job.productFilter(p.name) || p.rangeId === range.id);

  for (const flavor of job.flavors) {
    const src = path.join(job.sourceDir, flavor.file);
    if (!fs.existsSync(src)) {
      report.skipped.push({ job: job.rangeSlug, file: flavor.file, reason: "missing_file" });
      continue;
    }

    const scored = pool
      .map((p) => ({ p, score: matchScore(p.name, flavor.aliases, flavor.format) }))
      .filter((x) => x.score >= 0.8)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const as = (a.p.sumupProductId ? 100 : 0) + a.p.stock + (a.p.visibleOnline ? 1 : 0);
        const bs = (b.p.sumupProductId ? 100 : 0) + b.p.stock + (b.p.visibleOnline ? 1 : 0);
        return bs - as;
      });

    if (!scored.length) {
      report.skipped.push({
        job: job.rangeSlug,
        file: flavor.file,
        flavor: flavor.flavor,
        reason: "no_product",
      });
      continue;
    }

    const keeper = scored[0].p;
    const losers = scored.slice(1).map((x) => x.p);
    const formatLabel = flavor.format.replace("ml", " ml");
    const cleanName = productDisplayName(job.mfrName, job.rangeName, flavor.flavor, formatLabel);
    const outRel = `${job.mediaSubdir}/${flavor.format}/${flavor.flavor}.webp`;
    const outPath = path.resolve("public/media/products", outRel);
    const publicUrl = `/media/products/${outRel}`;

    const stockSum = [keeper, ...losers].reduce((s, p) => s + p.stock, 0);

    report.implanted.push({
      hierarchy: `${job.mfrName} → ${job.rangeName} → ${titleCase(flavor.flavor)} ${formatLabel}`,
      cleanName,
      keeper: keeper.name,
      losers: losers.map((l) => l.name),
      stockSum,
      publicUrl,
    });

    console.log(
      `${APPLY ? "[ok]" : "[dry]"} ${job.mfrName} → ${job.rangeName} → ${flavor.flavor} | keeper=${keeper.name} losers=${losers.length}`,
    );

    if (!APPLY) continue;

    await normalizeProductImageToEtastyStyle({
      inputBuffer: fs.readFileSync(src),
      outPath,
      flavorHint: `${flavor.flavor} ${job.rangeName} ${job.mfrName} ${keeper.name}`,
      keepNativeFruits: false,
    });

    for (const loser of losers) {
      await transferStock(loser.id, keeper.id);
      await prisma.inventoryLine.updateMany({
        where: { productId: loser.id },
        data: { productId: keeper.id },
      });
      await prisma.productImage.deleteMany({ where: { productId: loser.id } });
      await prisma.product.update({
        where: { id: loser.id },
        data: { imageUrl: null, imageStatus: "pending", stock: 0, rangeId: null, range: null },
      });
      await quarantineDuplicateProduct(prisma, loser.id, `${job.rangeSlug}_dedupe:${flavor.flavor}->${keeper.id}`);
      if (!loser.sumupProductId) {
        await prisma.productVariant.deleteMany({ where: { productId: loser.id } });
        await prisma.stockLevel.deleteMany({ where: { productId: loser.id } });
        await prisma.product.delete({ where: { id: loser.id } }).catch(() => null);
      }
    }

    await prisma.product.update({
      where: { id: keeper.id },
      data: {
        name: cleanName,
        manufacturerId: mfr.id,
        brandId: brand.id,
        brand: job.mfrName,
        rangeId: range.id,
        range: job.rangeName,
        productType: flavor.format,
        imageUrl: publicUrl,
        imageStatus: "official",
        stock: stockSum,
        visibleOnline: true,
        isActive: true,
        catalogStatus: "valide",
        importAnomaly: null,
      },
    });
    await setProductPhoto(keeper.id, publicUrl, cleanName);
  }
}

/** Renomme Hellfest / Kung Freeze déjà implantés au format Fabricant — Gamme — Produit */
async function renameCloudHellfestKung(report: any) {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "cloud-vapor" } });
  if (!mfr) return;
  const rows = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      range: { in: ["Hellfest", "Kung Freeze"] },
      visibleOnline: true,
    },
  });

  for (const p of rows) {
    const n = norm(p.name);
    let flavor = "";
    let rangeName = p.range || "";
    if (/hellfest/.test(n)) {
      rangeName = "Hellfest";
      if (n.includes("blue") || n.includes("rasphell")) flavor = "blue-rasphell";
      else if (n.includes("cherry")) flavor = "cherry-devil";
      else if (n.includes("dragon") && n.includes("blast")) flavor = "dragon-blast";
    } else if (/kung/.test(n)) {
      rangeName = "Kung Freeze";
      if (n.includes("black")) flavor = "black";
      else if (n.includes("dragon")) flavor = "dragon";
      else if (n.includes("midnight")) flavor = "midnight";
      else if (n.includes("red")) flavor = "red";
      else if (n.includes("sunlight")) flavor = "sunlight";
      else if (n.includes("sunrise")) flavor = "sunrise";
      else if (n.includes("sunset") || n.includes("sunsef")) flavor = "sunset";
    }
    if (!flavor) continue;
    const cleanName = productDisplayName("Cloud Vapor", rangeName, flavor, "50 ml");
    report.renamed.push({ from: p.name, to: cleanName, stock: p.stock });
    console.log(`${APPLY ? "[rename]" : "[dry-rename]"} ${p.name} => ${cleanName} (stock=${p.stock})`);
    if (!APPLY) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: cleanName,
        brand: "Cloud Vapor",
        range: rangeName,
        // stock untouched field-wise (same value)
      },
    });
  }
}

/** Pastis 13 : rename only, keep existing photo */
async function renamePastis(report: any) {
  const rows = await prisma.product.findMany({
    where: {
      manufacturer: { slug: "liquidarom" },
      name: { contains: "Pastis", mode: "insensitive" },
    },
  });
  for (const p of rows) {
    const cleanName = "Liquidarom — Les Essentiels — Pastis 13 50 ml";
    report.renamed.push({ from: p.name, to: cleanName, stock: p.stock, photoKept: p.imageUrl });
    if (!APPLY) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: cleanName,
        brand: "Liquidarom",
        range: "Les Essentiels",
        visibleOnline: true,
        isActive: true,
      },
    });
  }
}

async function main() {
  const report: any = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    naming: "Fabricant — Gamme — Produit format",
    implanted: [],
    skipped: [],
    renamed: [],
    notes: [
      "stock préservé / transféré vers keeper",
      "covers gamme non touchées",
      "bloodmon non intégré (doute)",
      "concentrés Call of Vape 30ml exclus",
      "Zombie 50ml Call of Vape exclu (photo 100ml)",
    ],
  };

  console.log(`Mode=${report.mode}`);
  for (const job of JOBS) {
    await implantJob(job, report);
  }
  await renameCloudHellfestKung(report);
  await renamePastis(report);

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        implanted: report.implanted.length,
        skipped: report.skipped,
        renamed: report.renamed.length,
        report: REPORT,
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
