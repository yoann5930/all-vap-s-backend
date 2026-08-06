/**
 * Republie / complète les e-liquides e.Tasty 10 ml.
 *
 * Règles :
 * - format strictement 10 ml
 * - photo officielle 10 ml uniquement (jamais 50/100)
 * - image URL / fichier doit correspondre à la saveur
 * - gamme : One Taste si confirmée sur pro.e-tasty.fr (saveur listée en 10 ml)
 * - publication seulement si photo OK + prix + sumup + format + gamme
 * - pas d'écriture SumUp, pas d'invention
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";

const MEDIA_ROOT = path.resolve("public/media/products/e-tasty");
const REPORT = path.resolve("data/rebuild/RAPPORT_ETASTY_10ML.json");
const REPORT_MD = path.resolve("data/rebuild/RAPPORT_ETASTY_10ML.md");
const OFFICIAL_JSON = path.resolve("data/rebuild/ETASTY_ONE_TASTE_10ML_OFFICIAL.json");

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/carnival/g, "carnaval")
    .replace(/sauvege/g, "sauvage")
    .replace(/givree|givre/g, "givre")
    .replace(/doree|dore/g, "dore")
    .replace(/\bpopcorn\b/g, "pop corn")
    .replace(/sel(s)?\s*(de\s*)?nicotine/g, " ")
    .replace(/\bsels?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isETasty(name: string): boolean {
  return /e[-\s]?tasty|etasty/i.test(name);
}

function is10ml(name: string, category: string, productType: string | null): boolean {
  if (productType === "10ml") return true;
  const t = `${name} ${category}`.toLowerCase();
  if (/\b100\s*ml\b/.test(t) || /\b50\s*ml\b/.test(t) || /\b30\s*ml\b/.test(t)) return false;
  return /\b10\s*ml\b|05\.e-liquide\s*10/.test(t);
}

function detectNicotine(name: string): { mg: number | null; label: string | null; isSalt: boolean } {
  const isSalt = /sel(s)?\s*(de\s*)?nicotine/i.test(name);
  const m = name.match(/\b(\d+)\s*mg\b/i);
  if (!m) return { mg: null, label: null, isSalt };
  return {
    mg: Number(m[1]),
    label: isSalt ? `${m[1]} mg sel` : `${m[1]} mg`,
    isSalt,
  };
}

function extractFlavor(name: string): string {
  return name
    .replace(/e[-\s]?tasty|etasty/gi, " ")
    .replace(/one\s*taste/gi, " ")
    // corrige "Menthe fraiche10ml" sans espace
    .replace(/([a-zàâäéèêëïîôùûüç])(\d+\s*ml)/gi, "$1 $2")
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/sel(s)?\s*(de\s*)?nicotine/gi, " ")
    .replace(/[-_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Official10 = {
  title: string;
  flavorKey: string;
  imageUrl: string;
  productUrl: string;
  ean: string | null;
  isSalt: boolean;
};

function flavorFromOfficialTitle(title: string): string {
  return norm(
    title
      .replace(/one\s*taste/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/sel(s)?\s*(de\s*)?nicotine/gi, " ")
      .replace(/flacon|e-?liquide/gi, " ")
  );
}

function imageMatchesFlavor(imageUrl: string, flavorKey: string): boolean {
  const file = norm(path.basename(imageUrl).replace(/\.[a-z0-9]+$/i, ""));
  if (!flavorKey || flavorKey.length < 3) return false;
  // Require significant token overlap between flavor and image filename
  const fTokens = flavorKey.split(" ").filter((t) => t.length > 2);
  const hits = fTokens.filter((t) => file.includes(t));
  if (fTokens.length === 0) return false;
  // Reject obvious cross-flavor (e.g. barbe a papa title with poire image)
  if (hits.length === 0) return false;
  return hits.length >= Math.ceil(fTokens.length * 0.5);
}

async function scrapeOneTaste10ml(): Promise<Official10[]> {
  // Priorité : scrape multi-pages déjà généré
  if (fs.existsSync(OFFICIAL_JSON)) {
    const cached = JSON.parse(fs.readFileSync(OFFICIAL_JSON, "utf8")) as {
      items: Official10[];
    };
    if (cached.items?.length) {
      return cached.items.map((o) => ({
        ...o,
        flavorKey: norm(o.flavorKey),
      }));
    }
  }

  // Fallback page 1 only
  const { execSync } = await import("node:child_process");
  execSync("npx --yes tsx scripts/scrape-etasty-one-taste-10ml.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  const cached = JSON.parse(fs.readFileSync(OFFICIAL_JSON, "utf8")) as {
    items: Official10[];
  };
  return cached.items.map((o) => ({ ...o, flavorKey: norm(o.flavorKey) }));
}

function matchOfficial(official: Official10[], flavor: string, isSalt: boolean): Official10 | null {
  const fk = norm(flavor);
  let best: Official10 | null = null;
  let bestScore = 0;
  for (const o of official) {
    // Prefer same salt/freebase family, but allow fallback if unique flavor
    const saltPenalty = o.isSalt === isSalt ? 0 : -25;
    let score = 0;
    const ok = norm(o.flavorKey);
    if (ok === fk) score = 100;
    else if (ok.includes(fk) || fk.includes(ok)) score = 80;
    else {
      const a = new Set(fk.split(" ").filter((x) => x.length > 2));
      const b = new Set(ok.split(" ").filter((x) => x.length > 2));
      const inter = [...a].filter((x) => b.has(x));
      if (!inter.length) continue;
      score = (inter.length / Math.max(a.size, b.size)) * 70;
    }
    score += saltPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return bestScore >= 55 ? best : null;
}

async function ensureOfficial10mlPhoto(
  imageUrl: string,
  flavorKey: string,
  productSlug: string
): Promise<{ url: string; source: string } | null> {
  // Enforce 10ml in remote path / filename
  if (/50ml|100ml|50-ml|100-ml/i.test(imageUrl) && !/10ml|10-ml/i.test(imageUrl)) {
    return null;
  }
  if (!imageMatchesFlavor(imageUrl, flavorKey)) {
    return null;
  }

  const dir = path.join(MEDIA_ROOT, "one-taste", "10ml");
  fs.mkdirSync(dir, { recursive: true });
  const destRel = `/media/products/e-tasty/one-taste/10ml/${productSlug}.webp`;
  const destAbs = path.resolve("public", destRel.replace(/^\//, ""));

  // If existing file is wrong flavor in name, rewrite
  const prefer = imageUrl
    .replace("large_default", "thickbox_default")
    .replace("home_default", "thickbox_default");

  let buf: Buffer | null = null;
  for (const u of [prefer, imageUrl]) {
    try {
      const res = await fetch(u, {
        headers: { "User-Agent": "AllVapsCatalogBot/1.0 (official 10ml packshot)" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 800) continue;
      buf = Buffer.from(ab);
      break;
    } catch {
      /* try next */
    }
  }
  if (!buf) return null;

  await sharp(buf)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(destAbs);

  return { url: destRel, source: imageUrl };
}

async function main() {
  console.log("=== e.Tasty 10 ml — intégration ===\n");
  const official = await scrapeOneTaste10ml();
  console.log(`Officiel One Taste 10 ml : ${official.length}`);
  console.log(
    `Photos matching flavor : ${official.filter((o) => imageMatchesFlavor(o.imageUrl, o.flavorKey)).length}`
  );

  const manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "e-tasty" } });
  const brand = await prisma.brand.findUnique({ where: { slug: "e-tasty" } });
  const oneTaste = await prisma.productRange.findFirst({
    where: { slug: "one-taste", manufacturerId: manufacturer?.id },
  });
  if (!manufacturer || !brand || !oneTaste) {
    throw new Error("Référentiel e.Tasty / One Taste manquant — lancer integrate-etasty d'abord");
  }

  const all = await prisma.product.findMany({
    where: {
      OR: [
        { brand: "e.Tasty" },
        { manufacturerId: manufacturer.id },
        { name: { contains: "tasty", mode: "insensitive" } },
      ],
    },
    include: { variants: true, catalogImages: true, flavors: true },
  });

  const products = all.filter(
    (p) =>
      (isETasty(p.name) || isETasty(p.sumupName || "") || p.brand === "e.Tasty") &&
      is10ml(p.name, p.category, p.productType)
  );

  const report = {
    date: new Date().toISOString(),
    found10ml: products.length,
    integrated: 0,
    published: 0,
    variantsUpserted: 0,
    photosAssociated: 0,
    photosRejectedMismatch: 0,
    photosMissing: 0,
    sumupAssociated: 0,
    aVerifier: [] as Array<{ name: string; reason: string }>,
    publishedNames: [] as string[],
    officialFlavors: official.map((o) => o.title),
    controlUrl: "http://localhost:3000/formats/10ml",
    gammeUrl: "http://localhost:3000/gammes/one-taste?fabricant=e-tasty",
  };

  for (const p of products) {
    const nic = detectNicotine(p.name);
    const flavor = extractFlavor(p.name);
    const hit = matchOfficial(official, flavor, nic.isSalt);

    if (!hit) {
      report.aVerifier.push({ name: p.name, reason: "saveur_absente_catalogue_officiel_10ml" });
      await prisma.product.update({
        where: { id: p.id },
        data: {
          manufacturerId: manufacturer.id,
          brandId: brand.id,
          brand: "e.Tasty",
          productType: "10ml",
          catalogStatus: "a_verifier",
          visibleOnline: false,
          importAnomaly: "saveur_absente_catalogue_officiel_10ml",
          productFamily: p.productFamily || "ETASTY_A_VERIFIER",
        },
      });
      continue;
    }

    // Photo : uniquement si filename match flavor
    let imageUrl = p.imageUrl;
    let imageStatus = p.imageStatus;
    const localLooks10 =
      imageUrl?.includes("/10ml/") &&
      imageUrl.startsWith("/media/products/e-tasty/") &&
      !/\/50ml\/|\/100ml\//.test(imageUrl || "");

    const localFlavorOk =
      localLooks10 && imageMatchesFlavor(imageUrl || "", hit.flavorKey);

    if (!localFlavorOk) {
      if (imageMatchesFlavor(hit.imageUrl, hit.flavorKey)) {
        const downloaded = await ensureOfficial10mlPhoto(
          hit.imageUrl,
          hit.flavorKey,
          slugify(p.slug || p.name)
        );
        if (downloaded) {
          imageUrl = downloaded.url;
          imageStatus = "official";
          report.photosAssociated++;
          const exists = p.catalogImages.find((i) => i.url === downloaded.url);
          if (!exists) {
            await prisma.productImage.create({
              data: {
                productId: p.id,
                url: downloaded.url,
                status: "official",
                sortOrder: 0,
                alt: `One Taste — ${flavor} 10 ml`,
              },
            });
          }
        } else {
          report.photosMissing++;
          imageUrl = null;
          imageStatus = "pending";
        }
      } else {
        report.photosRejectedMismatch++;
        // Clear bad photo (e.g. wrong flavor image)
        if (p.imageUrl && (/\/50ml\/|\/100ml\//.test(p.imageUrl) || !imageMatchesFlavor(p.imageUrl, hit.flavorKey))) {
          imageUrl = null;
          imageStatus = "pending";
        }
        report.photosMissing++;
      }
    } else {
      // Keep existing correct 10ml photo
      imageStatus = "official";
    }

    // Variant nicotine
    if (!p.variants[0]) {
      await prisma.productVariant.create({
        data: {
          productId: p.id,
          name: nic.label ? `10ml ${nic.label}` : "10ml",
          capacityMl: 10,
          nicotineMg: nic.mg,
          nicotineLabel: nic.label,
          sumupVariantId: p.sumupVariantId,
          barcode: p.barcode || hit.ean,
          active: true,
        },
      });
      report.variantsUpserted++;
    } else {
      await prisma.productVariant.update({
        where: { id: p.variants[0].id },
        data: {
          capacityMl: 10,
          nicotineMg: nic.mg ?? p.variants[0].nicotineMg,
          nicotineLabel: nic.label ?? p.variants[0].nicotineLabel,
          sumupVariantId: p.sumupVariantId || p.variants[0].sumupVariantId,
          barcode: p.barcode || hit.ean || p.variants[0].barcode,
          active: true,
        },
      });
      report.variantsUpserted++;
    }

    // Flavor meta
    if (!p.flavors[0]) {
      await prisma.productFlavor.create({
        data: {
          productId: p.id,
          primaryFlavor: flavor,
          flavors: [flavor],
          searchKeywords: `e.Tasty One Taste ${flavor} 10ml`,
        },
      });
    }

    const fileOk =
      !!imageUrl &&
      imageUrl.startsWith("/media/") &&
      imageUrl.includes("/10ml/") &&
      !/\/50ml\/|\/100ml\//.test(imageUrl) &&
      fs.existsSync(path.resolve("public", imageUrl.replace(/^\//, "")));

    const canPublish =
      imageStatus === "official" &&
      fileOk &&
      !!p.priceCents &&
      p.priceCents > 0 &&
      !!p.sumupProductId;

    if (p.sumupProductId) report.sumupAssociated++;
    report.integrated++;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        brand: "e.Tasty",
        rangeId: oneTaste.id,
        range: "One Taste",
        productFamily: "ETASTY_ONE_TASTE",
        productType: "10ml",
        imageUrl: imageUrl,
        imageStatus: imageStatus || "pending",
        barcode: p.barcode || hit.ean || undefined,
        catalogStatus: canPublish ? "valide" : "a_verifier",
        visibleOnline: canPublish,
        isActive: true,
        importAnomaly: canPublish
          ? null
          : [
              !fileOk || imageStatus !== "official" ? "photo_10ml_officielle_manquante_ou_invalide" : null,
              !p.priceCents ? "prix_manquant" : null,
              !p.sumupProductId ? "sumup_manquant" : null,
            ]
              .filter(Boolean)
              .join("|"),
      },
    });

    if (canPublish) {
      report.published++;
      report.publishedNames.push(p.name);
    } else {
      report.aVerifier.push({
        name: p.name,
        reason: !fileOk || imageStatus !== "official" ? "photo" : !p.priceCents ? "prix" : "sumup",
      });
    }

    await new Promise((r) => setTimeout(r, 30));
  }

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  const md = `# Rapport e.Tasty 10 ml

Date : ${report.date}

## Volumes
- Produits 10 ml trouvés (SumUp / DB) : **${report.found10ml}**
- Intégrés (reliés fabricant + gamme One Taste) : **${report.integrated}**
- Publiés en ligne : **${report.published}**
- Variantes nicotine upsert : **${report.variantsUpserted}**
- Photos 10 ml associées / validées : **${report.photosAssociated}**
- Photos rejetées (mismatch saveur / format) : **${report.photosRejectedMismatch}**
- Photos manquantes : **${report.photosMissing}**
- Références SumUp présentes : **${report.sumupAssociated}**
- Restant À vérifier : **${report.aVerifier.length}**

## Contrôle
- Filtre 10 ml : ${report.controlUrl}
- Gamme One Taste : ${report.gammeUrl}
- Fabricant : http://localhost:3000/fabricants/e-tasty

## Règles
- Aucune photo 50 ml / 100 ml utilisée pour un 10 ml
- Aucune invention prix / nicotine / EAN / goût
- Publication uniquement si photo officielle 10 ml + prix SumUp + ID SumUp
`;
  fs.writeFileSync(REPORT_MD, md, "utf8");
  console.log(
    JSON.stringify(
      {
        found10ml: report.found10ml,
        integrated: report.integrated,
        published: report.published,
        variantsUpserted: report.variantsUpserted,
        photosAssociated: report.photosAssociated,
        photosRejectedMismatch: report.photosRejectedMismatch,
        photosMissing: report.photosMissing,
        sumupAssociated: report.sumupAssociated,
        aVerifier: report.aVerifier.length,
        report: REPORT_MD,
      },
      null,
      2
    )
  );
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(async () => prisma.$disconnect());
