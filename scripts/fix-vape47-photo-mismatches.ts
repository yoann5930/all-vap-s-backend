/**
 * Corrige les packshots Vape 47 mal matchés (score slug vs nom produit).
 * Dé-publie / retire image si mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const FLAVORS = [
  "original",
  "mango",
  "mangue",
  "green",
  "red",
  "pink",
  "yellow",
  "purple",
  "blue",
  "ultimate",
  "freeze",
  "dragon",
  "cerise",
  "framboise",
  "peche",
  "cassis",
  "aria",
  "doom",
  "ivy",
  "juno",
  "nova",
  "volta",
  "griffon",
  "ultron",
  "ruby",
  "ryu",
  "falkor",
  "soko",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function flavorIn(text: string): string[] {
  const n = norm(text);
  return FLAVORS.filter((f) => n.includes(f));
}

function imageOk(productName: string, imageUrl: string | null): boolean {
  if (!imageUrl) return false;
  const file = path.basename(imageUrl, path.extname(imageUrl));
  const pf = flavorIn(productName);
  const iff = flavorIn(file);
  if (pf.length === 0) return false;
  // Au moins une saveur du nom doit être dans le fichier
  return pf.some((f) => iff.includes(f) || norm(file).includes(f));
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "vape-47" } });
  if (!mfr) throw new Error("missing");

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      isActive: true,
      imageUrl: { startsWith: "/media/products/vape-47/" },
    },
  });

  let kept = 0;
  let cleared = 0;

  for (const p of products) {
    const ok = imageOk(p.name, p.imageUrl);
    if (ok) {
      kept++;
      console.log("KEEP", p.name, "→", p.imageUrl);
      continue;
    }
    // Remove wrong file + unpublish
    if (p.imageUrl) {
      const abs = path.join(process.cwd(), "public", p.imageUrl.replace(/^\//, ""));
      if (fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
        } catch {
          /* ignore */
        }
      }
    }
    await prisma.product.update({
      where: { id: p.id },
      data: {
        imageUrl: null,
        imageStatus: "pending",
        visibleOnline: false,
        catalogStatus: "a_verifier",
        importAnomaly: "photo_officielle_mismatch_ou_manquante",
      },
    });
    cleared++;
    console.log("CLEAR", p.name, "was", p.imageUrl);
  }

  // Re-publish only products that still have matching official images + sumup
  const remaining = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      isActive: true,
      imageStatus: "official",
      imageUrl: { startsWith: "/media/products/vape-47/" },
      sumupProductId: { not: null },
      priceCents: { gt: 0 },
    },
  });
  for (const p of remaining) {
    if (!imageOk(p.name, p.imageUrl)) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        visibleOnline: true,
        catalogStatus: "valide",
        importAnomaly: null,
        sumupName: p.sumupName || p.name,
      },
    });
  }

  console.log({ kept, cleared, republishCandidates: remaining.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
