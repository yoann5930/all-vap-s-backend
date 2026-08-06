/**
 * Regroupe les dosages nicotine One Taste (e.Tasty) :
 * 1 produit public par saveur + format (+ sels vs freebase)
 * N ProductVariant (0/3/6/12 mg…) avec SumUp / EAN / prix / stock
 *
 * Ne supprime pas les lignes SumUp sources : les masque (merged_into).
 * Aucune écriture SumUp.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

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
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return norm(s).replace(/\s+/g, "-").slice(0, 70);
}

function detectNicotine(name: string): { mg: number | null; isSalt: boolean; label: string | null } {
  const isSalt = /sel(s)?\s*(de\s*)?nicotine/i.test(name);
  const m = name.match(/\b(\d+)\s*mg\b/i);
  if (!m) return { mg: null, isSalt, label: null };
  const mg = Number(m[1]);
  return { mg, isSalt, label: isSalt ? `${mg} mg sel` : `${mg} mg` };
}

function extractFlavor(name: string): string {
  return name
    .replace(/e[-\s]?tasty|etasty/gi, " ")
    .replace(/one\s*taste/gi, " ")
    .replace(/([a-zàâäéèêëïîôùûüç])(\d+\s*ml)/gi, "$1 $2")
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/sel(s)?\s*(de\s*)?nicotine/gi, " ")
    .replace(/[-_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseFlavor(flavor: string): string {
  return flavor
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function displayName(flavor: string, format: string, isSalt: boolean): string {
  const f = titleCaseFlavor(flavor);
  const salt = isSalt ? " — Sels de nicotine" : "";
  return `${f} — One Taste — ${format.replace("ml", " ml")}${salt}`;
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 0;
  while (await prisma.product.findFirst({ where: { slug } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      productFamily: "ETASTY_ONE_TASTE",
      brand: "e.Tasty",
      // Inclure publiés + à vérifier (ex. Barbe à Papa) pour regrouper les dosages
      OR: [
        { visibleOnline: true },
        { catalogStatus: { in: ["valide", "actif", "a_verifier"] } },
      ],
    },
    include: { variants: true, catalogImages: true, flavors: true },
    orderBy: { name: "asc" },
  });

  // Group by flavor + format + salt
  const groups = new Map<string, typeof products>();
  for (const p of products) {
    // Skip already-merged shells
    if (p.importAnomaly?.startsWith("merged_into:")) continue;
    const format = p.productType || "10ml";
    const nic = detectNicotine(p.name);
    const flavor = extractFlavor(p.name);
    if (!flavor) continue;
    const key = `${norm(flavor)}|${format}|${nic.isSalt ? "salt" : "fb"}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  const report = {
    date: new Date().toISOString(),
    groups: 0,
    merged: 0,
    primaries: [] as Array<{ name: string; slug: string; variants: number; dosages: number[] }>,
    skippedSingleton: 0,
  };

  for (const [key, items] of groups) {
    if (items.length < 2) {
      // Still normalize display name for singletons with nicotine in title
      const p = items[0];
      if (!p) continue;
      const nic = detectNicotine(p.name);
      const flavor = extractFlavor(p.name);
      const format = p.productType || "10ml";
      if (/\b\d+\s*mg\b/i.test(p.name)) {
        const newName = displayName(flavor, format, nic.isSalt);
        // Ensure variant has price/stock/sumup
        const v = p.variants[0];
        if (v) {
          await prisma.productVariant.update({
            where: { id: v.id },
            data: {
              name: nic.label || `${nic.mg ?? "?"} mg`,
              nicotineMg: nic.mg,
              nicotineLabel: nic.label,
              capacityMl: parseFloat(format) || 10,
              priceCents: p.priceCents,
              stock: p.stock,
              sumupProductId: p.sumupProductId,
              sumupVariantId: p.sumupVariantId || v.sumupVariantId,
              barcode: p.barcode || v.barcode,
              active: true,
            },
          });
        } else if (nic.mg != null) {
          await prisma.productVariant.create({
            data: {
              productId: p.id,
              name: nic.label || `${nic.mg} mg`,
              nicotineMg: nic.mg,
              nicotineLabel: nic.label,
              capacityMl: parseFloat(format) || 10,
              priceCents: p.priceCents,
              stock: p.stock,
              sumupProductId: p.sumupProductId,
              sumupVariantId: p.sumupVariantId,
              barcode: p.barcode,
              active: true,
            },
          });
        }
        await prisma.product.update({
          where: { id: p.id },
          data: {
            name: newName,
            shortDescription: `${titleCaseFlavor(flavor)} — gamme One Taste — format ${format.replace("ml", " ml")}.`,
          },
        });
      }
      report.skippedSingleton++;
      continue;
    }

    report.groups++;

    // Prefer product with official photo + lowest nicotine as primary
    const sorted = [...items].sort((a, b) => {
      const aPhoto = a.imageStatus === "official" && a.imageUrl ? 1 : 0;
      const bPhoto = b.imageStatus === "official" && b.imageUrl ? 1 : 0;
      if (bPhoto !== aPhoto) return bPhoto - aPhoto;
      const an = detectNicotine(a.name).mg ?? 999;
      const bn = detectNicotine(b.name).mg ?? 999;
      return an - bn;
    });
    const primary = sorted[0]!;
    const flavor = extractFlavor(primary.name);
    const format = primary.productType || "10ml";
    const isSalt = detectNicotine(primary.name).isSalt;
    const newName = displayName(flavor, format, isSalt);
    const baseSlug = slugify(
      `one-taste-${flavor}-${format}${isSalt ? "-sels" : ""}`
    );
    // Keep primary slug if already clean enough, else set new unique
    let primarySlug = primary.slug;
    if (/\d+mg/i.test(primary.slug) || /e-tasty/i.test(primary.slug)) {
      primarySlug = await uniqueSlug(baseSlug);
    }

    // Clear existing variants on primary — rebuild from all siblings
    await prisma.productVariant.deleteMany({ where: { productId: primary.id } });

    const dosages: number[] = [];
    let totalStock = 0;
    let minPrice = primary.priceCents;

    for (const src of sorted) {
      const nic = detectNicotine(src.name);
      if (nic.mg == null) continue;
      dosages.push(nic.mg);
      totalStock += src.stock || 0;
      if (src.priceCents > 0 && (minPrice <= 0 || src.priceCents < minPrice)) {
        minPrice = src.priceCents;
      }

      await prisma.productVariant.create({
        data: {
          productId: primary.id,
          name: nic.label || `${nic.mg} mg`,
          nicotineMg: nic.mg,
          nicotineLabel: nic.label,
          capacityMl: parseFloat(format) || 10,
          priceCents: src.priceCents,
          stock: src.stock,
          sumupProductId: src.sumupProductId,
          sumupVariantId: src.sumupVariantId,
          barcode: src.barcode,
          sku: src.sku,
          active: true,
        },
      });

      // Move catalog images onto primary if primary lacks
      if (src.id !== primary.id) {
        for (const img of src.catalogImages) {
          const exists = await prisma.productImage.findFirst({
            where: { productId: primary.id, url: img.url },
          });
          if (!exists) {
            await prisma.productImage.create({
              data: {
                productId: primary.id,
                url: img.url,
                status: img.status,
                sortOrder: img.sortOrder,
                alt: img.alt,
              },
            });
          }
        }

        // Hide sibling — keep data, point to primary
        await prisma.product.update({
          where: { id: src.id },
          data: {
            visibleOnline: false,
            catalogStatus: "archive",
            isActive: false,
            importAnomaly: `merged_into:${primarySlug}|nic:${nic.mg}`,
          },
        });
        // Deactivate old variants on sibling
        await prisma.productVariant.updateMany({
          where: { productId: src.id },
          data: { active: false },
        });
        report.merged++;
      }
    }

    // Flavor meta
    if (!primary.flavors[0]) {
      await prisma.productFlavor.create({
        data: {
          productId: primary.id,
          primaryFlavor: titleCaseFlavor(flavor),
          flavors: [titleCaseFlavor(flavor)],
          searchKeywords: `e.Tasty One Taste ${flavor} ${format} ${dosages.map((d) => `${d}mg`).join(" ")}`,
        },
      });
    } else {
      await prisma.productFlavor.update({
        where: { id: primary.flavors[0].id },
        data: {
          primaryFlavor: titleCaseFlavor(flavor),
          flavors: [titleCaseFlavor(flavor)],
          searchKeywords: `e.Tasty One Taste ${flavor} ${format} ${dosages.map((d) => `${d}mg`).join(" ")}`,
        },
      });
    }

    // Ne pas republier automatiquement un groupe encore « à vérifier »
    const canPublish = sorted.every(
      (p) =>
        (p.catalogStatus === "valide" || p.catalogStatus === "actif") &&
        p.imageUrl &&
        (p.imageStatus === "official" || p.imageStatus === "validated")
    ) || (primary.visibleOnline && ["valide", "actif"].includes(primary.catalogStatus || ""));

    await prisma.product.update({
      where: { id: primary.id },
      data: {
        name: newName,
        slug: primarySlug,
        shortDescription: `${titleCaseFlavor(flavor)} — One Taste (e.Tasty) — ${format.replace("ml", " ml")}. Dosages : ${[...new Set(dosages)].sort((a, b) => a - b).join(", ")} mg.`,
        priceCents: minPrice,
        stock: totalStock,
        visibleOnline: canPublish ? true : false,
        isActive: canPublish ? true : primary.isActive,
        catalogStatus: canPublish ? "valide" : primary.catalogStatus === "archive" ? "a_verifier" : primary.catalogStatus,
        productType: format,
        range: "One Taste",
        brand: "e.Tasty",
        importAnomaly: canPublish ? null : primary.importAnomaly,
        // Keep best image
        imageUrl: primary.imageUrl,
        imageStatus: primary.imageStatus,
      },
    });

    report.primaries.push({
      name: newName,
      slug: primarySlug,
      variants: dosages.length,
      dosages: [...new Set(dosages)].sort((a, b) => a - b),
    });
  }

  const out = path.resolve("data/rebuild/RAPPORT_ONE_TASTE_VARIANTS.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        groupsMerged: report.groups,
        siblingsHidden: report.merged,
        primaries: report.primaries.length,
        singletonsNormalized: report.skippedSingleton,
        sample: report.primaries.find((p) => /ananas/i.test(p.name)) || report.primaries[0],
        out,
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
