import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATALOG_CATEGORIES } from "../lib/catalog/categories";

const prisma = new PrismaClient();

const brands = [
  { name: "GeekVape", slug: "geekvape" },
  { name: "Vaporesso", slug: "vaporesso" },
  { name: "Pulp", slug: "pulp" },
  { name: "Alfaliquid", slug: "alfaliquid" },
  { name: "Dinner Lady", slug: "dinner-lady" },
  { name: "Lost Vape", slug: "lost-vape" },
  { name: "Nitecore", slug: "nitecore" },
  { name: "Innokin", slug: "innokin" },
  { name: "Voopoo", slug: "voopoo" },
  { name: "Smok", slug: "smok" },
  { name: "Vampire Vape", slug: "vampire-vape" },
  { name: "Capella", slug: "capella" },
];

const IMG = {
  device: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=600",
  pod: "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=600",
  eliquid: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600",
  accessory: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600",
  battery: "https://images.unsplash.com/photo-1609091839311-9d67056a9f7c?w=600",
};

async function main() {
  const adminPassword = await bcrypt.hash("Admin123!", 12);

  await prisma.user.upsert({
    where: { email: "admin@allvaps.fr" },
    update: {},
    create: {
      email: "admin@allvaps.fr",
      passwordHash: adminPassword,
      firstName: "Admin",
      lastName: "All Vap's",
      role: "ADMIN",
      loyaltyPoints: 0,
    },
  });

  const categoryMap: Record<string, string> = {};
  for (const cat of CATALOG_CATEGORIES) {
    const c = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
        sortOrder: cat.sortOrder,
      },
      create: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        sortOrder: cat.sortOrder,
      },
    });
    categoryMap[cat.slug] = c.id;
  }

  const brandMap: Record<string, string> = {};
  for (const b of brands) {
    const brand = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: b,
      create: b,
    });
    brandMap[b.slug] = brand.id;
  }

  const products = [
    { name: "Kit Innokin Endura T18 II", slug: "innokin-endura-t18-ii", sku: "AV-CE-001", category: "cigarettes-electroniques", brand: "Innokin", brandId: brandMap["innokin"], imageUrl: IMG.device, images: [IMG.device, IMG.pod], priceCents: 2990, stock: 20, isNew: true, salesCount: 45 },
    { name: "Kit Vaporesso Eco Nano", slug: "vaporesso-eco-nano", sku: "AV-CE-002", category: "cigarettes-electroniques", brand: "Vaporesso", brandId: brandMap["vaporesso"], imageUrl: IMG.pod, priceCents: 1990, stock: 35, salesCount: 62 },
    { name: "Vaporesso XROS 3 Mini", slug: "vaporesso-xros-3-mini", sku: "AV-POD-001", category: "pods", brand: "Vaporesso", brandId: brandMap["vaporesso"], imageUrl: IMG.pod, images: [IMG.pod], priceCents: 2490, stock: 30, isNew: true, isBestSeller: true, salesCount: 78 },
    { name: "Lost Vape Ursa Nano Pro 2", slug: "lost-vape-ursa-nano-pro-2", sku: "AV-POD-002", category: "pods", brand: "Lost Vape", brandId: brandMap["lost-vape"], imageUrl: IMG.pod, priceCents: 3490, stock: 25, isBestSeller: true, salesCount: 55 },
    { name: "GeekVape Aegis Legend 2", slug: "geekvape-aegis-legend-2", sku: "AV-BOX-001", category: "box", brand: "GeekVape", brandId: brandMap["geekvape"], imageUrl: IMG.device, priceCents: 6990, stock: 15, isBestSeller: true, salesCount: 42 },
    { name: "Voopoo Drag X Plus", slug: "voopoo-drag-x-plus", sku: "AV-BOX-002", category: "box", brand: "Voopoo", brandId: brandMap["voopoo"], imageUrl: IMG.device, priceCents: 5490, promoPriceCents: 4990, isPromo: true, stock: 18, salesCount: 38 },
    { name: "GeekVape Aegis Solo 3", slug: "geekvape-aegis-solo-3", sku: "AV-MOD-001", category: "mods", brand: "GeekVape", brandId: brandMap["geekvape"], imageUrl: IMG.device, priceCents: 4590, stock: 12, salesCount: 30 },
    { name: "Smok Morph 3", slug: "smok-morph-3", sku: "AV-MOD-002", category: "mods", brand: "Smok", brandId: brandMap["smok"], imageUrl: IMG.device, priceCents: 3990, stock: 10, salesCount: 22 },
    { name: "GeekVape Z Sub-Ohm Tank", slug: "geekvape-z-sub-ohm", sku: "AV-CLR-001", category: "clearomiseurs", brand: "GeekVape", brandId: brandMap["geekvape"], imageUrl: IMG.accessory, priceCents: 3290, stock: 22, salesCount: 40 },
    { name: "Vaporesso iTank 2", slug: "vaporesso-itank-2", sku: "AV-CLR-002", category: "clearomiseurs", brand: "Vaporesso", brandId: brandMap["vaporesso"], imageUrl: IMG.accessory, priceCents: 2790, stock: 28, salesCount: 35 },
    { name: "Résistances Vaporesso GTX 0.8Ω", slug: "vaporesso-gtx-08", sku: "AV-RES-001", category: "resistances", brand: "Vaporesso", brandId: brandMap["vaporesso"], imageUrl: IMG.accessory, priceCents: 1290, stock: 40, salesCount: 65 },
    { name: "Résistances GeekVape Z 0.2Ω", slug: "geekvape-z-02", sku: "AV-RES-002", category: "resistances", brand: "GeekVape", brandId: brandMap["geekvape"], imageUrl: IMG.accessory, priceCents: 1490, stock: 35, salesCount: 50 },
    { name: "E-liquide Pulp Blue Slush 50ml", slug: "pulp-blue-slush-50ml", sku: "AV-ELIQ-001", category: "e-liquides", brand: "Pulp", brandId: brandMap["pulp"], imageUrl: IMG.eliquid, priceCents: 1990, promoPriceCents: 1490, isPromo: true, stock: 50, salesCount: 120 },
    { name: "E-liquide Alfaliquid RY4 Classic 10ml", slug: "alfaliquid-ry4-classic-10ml", sku: "AV-ELIQ-002", category: "e-liquides", brand: "Alfaliquid", brandId: brandMap["alfaliquid"], imageUrl: IMG.eliquid, priceCents: 590, stock: 100, salesCount: 200 },
    { name: "E-liquide Dinner Lady Lemon Tart 50ml", slug: "dinner-lady-lemon-tart-50ml", sku: "AV-ELIQ-003", category: "e-liquides", brand: "Dinner Lady", brandId: brandMap["dinner-lady"], imageUrl: IMG.eliquid, priceCents: 2290, promoPriceCents: 1890, isPromo: true, stock: 35, salesCount: 90 },
    { name: "Kit DIY Débutant All Vap's", slug: "kit-diy-debutant", sku: "AV-DIY-001", category: "diy", imageUrl: IMG.accessory, priceCents: 2490, stock: 15, isNew: true, salesCount: 18 },
    { name: "Flacons gradués 10ml (x10)", slug: "flacons-gradues-10ml", sku: "AV-DIY-002", category: "diy", imageUrl: IMG.accessory, priceCents: 490, stock: 60, salesCount: 45 },
    { name: "Arôme Capella Blueberry 30ml", slug: "capella-blueberry-30ml", sku: "AV-ARO-001", category: "aromes", brand: "Capella", brandId: brandMap["capella"], imageUrl: IMG.eliquid, priceCents: 890, stock: 40, salesCount: 55 },
    { name: "Arôme Vampire Vape Heisenberg 30ml", slug: "vampire-vape-heisenberg", sku: "AV-ARO-002", category: "aromes", brand: "Vampire Vape", brandId: brandMap["vampire-vape"], imageUrl: IMG.eliquid, priceCents: 990, stock: 35, salesCount: 70 },
    { name: "Base DIY VPG 50/50 1L", slug: "base-diy-vpg-1l", sku: "AV-BAS-001", category: "bases", imageUrl: IMG.accessory, priceCents: 1290, stock: 40, salesCount: 35 },
    { name: "Base DIY VG 100% 1L", slug: "base-diy-vg-1l", sku: "AV-BAS-002", category: "bases", imageUrl: IMG.accessory, priceCents: 1190, stock: 45, salesCount: 30 },
    { name: "Booster Nicotine 20mg 10ml", slug: "booster-nicotine-20mg", sku: "AV-BOO-001", category: "boosters", imageUrl: IMG.eliquid, priceCents: 190, stock: 200, salesCount: 150 },
    { name: "Booster Nicotine 10mg 10ml", slug: "booster-nicotine-10mg", sku: "AV-BOO-002", category: "boosters", imageUrl: IMG.eliquid, priceCents: 190, stock: 180, salesCount: 130 },
    { name: "Chargeur Nitecore i2", slug: "nitecore-i2", sku: "AV-ACC-001", category: "accessoires", brand: "Nitecore", brandId: brandMap["nitecore"], imageUrl: IMG.accessory, priceCents: 1590, stock: 20, salesCount: 28 },
    { name: "Étui de transport rigide", slug: "etui-transport-rigide", sku: "AV-ACC-002", category: "accessoires", imageUrl: IMG.accessory, priceCents: 990, stock: 30, salesCount: 15 },
    { name: "Accu Samsung 18650 25R", slug: "samsung-18650-25r", sku: "AV-BAT-001", category: "batteries", imageUrl: IMG.battery, priceCents: 890, stock: 50, salesCount: 80 },
    { name: "Accu Molicel P42A 21700", slug: "molicel-p42a-21700", sku: "AV-BAT-002", category: "batteries", imageUrl: IMG.battery, priceCents: 1290, stock: 35, salesCount: 45 },
    { name: "Chargeur Nitecore D4", slug: "nitecore-d4", sku: "AV-CHA-001", category: "chargeurs", brand: "Nitecore", brandId: brandMap["nitecore"], imageUrl: IMG.accessory, priceCents: 2990, stock: 12, salesCount: 20 },
    { name: "Chargeur Xtar VC4", slug: "xtar-vc4", sku: "AV-CHA-002", category: "chargeurs", imageUrl: IMG.accessory, priceCents: 2490, stock: 15, salesCount: 18 },
    { name: "Verre Pyrex GeekVape Z", slug: "verre-geekvape-z", sku: "AV-VER-001", category: "verres", brand: "GeekVape", brandId: brandMap["geekvape"], imageUrl: IMG.accessory, priceCents: 490, stock: 55, salesCount: 60 },
    { name: "Verre Pyrex Vaporesso iTank", slug: "verre-vaporesso-itank", sku: "AV-VER-002", category: "verres", brand: "Vaporesso", brandId: brandMap["vaporesso"], imageUrl: IMG.accessory, priceCents: 590, stock: 48, salesCount: 52 },
    { name: "Drip Tip 810 Resine", slug: "drip-tip-810-resine", sku: "AV-DT-001", category: "drip-tips", imageUrl: IMG.accessory, priceCents: 790, stock: 40, salesCount: 25 },
    { name: "Drip Tip 510 Delrin", slug: "drip-tip-510-delrin", sku: "AV-DT-002", category: "drip-tips", imageUrl: IMG.accessory, priceCents: 590, stock: 45, salesCount: 30 },
  ];

  for (const product of products) {
    const categoryId = categoryMap[product.category];
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: { ...product, categoryId },
      create: { ...product, categoryId },
    });
  }

  await prisma.coupon.upsert({
    where: { code: "BIENVENUE10" },
    update: {},
    create: {
      code: "BIENVENUE10",
      description: "10% de réduction sur votre première commande",
      discountType: "PERCENT",
      value: 10,
      minOrderCents: 2000,
      maxUses: 1000,
    },
  });

  await prisma.banner.upsert({
    where: { id: "home-banner-1" },
    update: {},
    create: {
      id: "home-banner-1",
      title: "Nouveautés All Vap's",
      subtitle: "Découvrez notre sélection premium",
      imageUrl: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=1200&q=80",
      linkUrl: "/boutique?new=true",
      placement: "home",
      sortOrder: 0,
    },
  });

  console.log(`Seed OK — ${CATALOG_CATEGORIES.length} catégories, ${products.length} produits`);
  console.log("Admin : admin@allvaps.fr / Admin123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
