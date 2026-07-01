import bcrypt from "bcryptjs";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";

const BASE = new Date("2024-06-01T10:00:00.000Z");

const IMG = {
  device: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=600",
  pod: "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=600",
  eliquid: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600",
  accessory: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600",
  battery: "https://images.unsplash.com/photo-1609091839311-9d67056a9f7c?w=600",
};

const BRAND_DEFS = [
  { id: "br_geekvape", name: "GeekVape", slug: "geekvape" },
  { id: "br_vaporesso", name: "Vaporesso", slug: "vaporesso" },
  { id: "br_pulp", name: "Pulp", slug: "pulp" },
  { id: "br_alfaliquid", name: "Alfaliquid", slug: "alfaliquid" },
  { id: "br_dinner-lady", name: "Dinner Lady", slug: "dinner-lady" },
  { id: "br_lost-vape", name: "Lost Vape", slug: "lost-vape" },
  { id: "br_nitecore", name: "Nitecore", slug: "nitecore" },
  { id: "br_innokin", name: "Innokin", slug: "innokin" },
  { id: "br_voopoo", name: "Voopoo", slug: "voopoo" },
  { id: "br_smok", name: "Smok", slug: "smok" },
  { id: "br_vampire-vape", name: "Vampire Vape", slug: "vampire-vape" },
  { id: "br_capella", name: "Capella", slug: "capella" },
];

function brandId(slug: string) {
  return `br_${slug}`;
}

function catId(slug: string) {
  return `cat_${slug}`;
}

function prdId(slug: string) {
  return `prd_${slug}`;
}

export interface DemoStore {
  users: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  brands: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  favorites: Array<Record<string, unknown>>;
  addresses: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  coupons: Array<Record<string, unknown>>;
  banners: Array<Record<string, unknown>>;
  passwordResetTokens: Array<Record<string, unknown>>;
  vapeProfiles: Array<Record<string, unknown>>;
  vapeRecommendations: Array<Record<string, unknown>>;
}

export function buildDemoSeed(): DemoStore {
  const adminHash = bcrypt.hashSync("Admin123!", 12);
  const demoHash = bcrypt.hashSync("Demo123!", 12);

  const categories = CATALOG_CATEGORIES.map((c) => ({
    id: catId(c.slug),
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: null,
    sortOrder: c.sortOrder,
    isActive: true,
    createdAt: BASE,
    updatedAt: BASE,
  }));

  const brands = BRAND_DEFS.map((b) => ({
    ...b,
    logoUrl: null,
    isActive: true,
    createdAt: BASE,
    updatedAt: BASE,
  }));

  const productDefs = [
    { name: "Kit Innokin Endura T18 II", slug: "innokin-endura-t18-ii", sku: "AV-CE-001", category: "cigarettes-electroniques", brand: "Innokin", brandSlug: "innokin", imageUrl: IMG.device, images: [IMG.device, IMG.pod], priceCents: 2990, stock: 20, isNew: true, salesCount: 45 },
    { name: "Kit Vaporesso Eco Nano", slug: "vaporesso-eco-nano", sku: "AV-CE-002", category: "cigarettes-electroniques", brand: "Vaporesso", brandSlug: "vaporesso", imageUrl: IMG.pod, priceCents: 1990, stock: 35, salesCount: 62 },
    { name: "Vaporesso XROS 3 Mini", slug: "vaporesso-xros-3-mini", sku: "AV-POD-001", category: "pods", brand: "Vaporesso", brandSlug: "vaporesso", imageUrl: IMG.pod, images: [IMG.pod], priceCents: 2490, stock: 30, isNew: true, isBestSeller: true, salesCount: 78 },
    { name: "Lost Vape Ursa Nano Pro 2", slug: "lost-vape-ursa-nano-pro-2", sku: "AV-POD-002", category: "pods", brand: "Lost Vape", brandSlug: "lost-vape", imageUrl: IMG.pod, priceCents: 3490, stock: 25, isBestSeller: true, salesCount: 55 },
    { name: "GeekVape Aegis Legend 2", slug: "geekvape-aegis-legend-2", sku: "AV-BOX-001", category: "box", brand: "GeekVape", brandSlug: "geekvape", imageUrl: IMG.device, priceCents: 6990, stock: 15, isBestSeller: true, salesCount: 42 },
    { name: "Voopoo Drag X Plus", slug: "voopoo-drag-x-plus", sku: "AV-BOX-002", category: "box", brand: "Voopoo", brandSlug: "voopoo", imageUrl: IMG.device, priceCents: 5490, promoPriceCents: 4990, isPromo: true, stock: 18, salesCount: 38 },
    { name: "GeekVape Aegis Solo 3", slug: "geekvape-aegis-solo-3", sku: "AV-MOD-001", category: "mods", brand: "GeekVape", brandSlug: "geekvape", imageUrl: IMG.device, priceCents: 4590, stock: 12, salesCount: 30 },
    { name: "Smok Morph 3", slug: "smok-morph-3", sku: "AV-MOD-002", category: "mods", brand: "Smok", brandSlug: "smok", imageUrl: IMG.device, priceCents: 3990, stock: 10, salesCount: 22 },
    { name: "GeekVape Z Sub-Ohm Tank", slug: "geekvape-z-sub-ohm", sku: "AV-CLR-001", category: "clearomiseurs", brand: "GeekVape", brandSlug: "geekvape", imageUrl: IMG.accessory, priceCents: 3290, stock: 22, salesCount: 40 },
    { name: "Vaporesso iTank 2", slug: "vaporesso-itank-2", sku: "AV-CLR-002", category: "clearomiseurs", brand: "Vaporesso", brandSlug: "vaporesso", imageUrl: IMG.accessory, priceCents: 2790, stock: 28, salesCount: 35 },
    { name: "Résistances Vaporesso GTX 0.8Ω", slug: "vaporesso-gtx-08", sku: "AV-RES-001", category: "resistances", brand: "Vaporesso", brandSlug: "vaporesso", imageUrl: IMG.accessory, priceCents: 1290, stock: 40, salesCount: 65 },
    { name: "Résistances GeekVape Z 0.2Ω", slug: "geekvape-z-02", sku: "AV-RES-002", category: "resistances", brand: "GeekVape", brandSlug: "geekvape", imageUrl: IMG.accessory, priceCents: 1490, stock: 35, salesCount: 50 },
    { name: "E-liquide Pulp Blue Slush 50ml", slug: "pulp-blue-slush-50ml", sku: "AV-ELIQ-001", category: "e-liquides", brand: "Pulp", brandSlug: "pulp", imageUrl: IMG.eliquid, priceCents: 1990, promoPriceCents: 1490, isPromo: true, stock: 50, salesCount: 120 },
    { name: "E-liquide Alfaliquid RY4 Classic 10ml", slug: "alfaliquid-ry4-classic-10ml", sku: "AV-ELIQ-002", category: "e-liquides", brand: "Alfaliquid", brandSlug: "alfaliquid", imageUrl: IMG.eliquid, priceCents: 590, stock: 100, salesCount: 200 },
    { name: "E-liquide Dinner Lady Lemon Tart 50ml", slug: "dinner-lady-lemon-tart-50ml", sku: "AV-ELIQ-003", category: "e-liquides", brand: "Dinner Lady", brandSlug: "dinner-lady", imageUrl: IMG.eliquid, priceCents: 2290, promoPriceCents: 1890, isPromo: true, stock: 35, salesCount: 90 },
    { name: "Kit DIY Débutant All Vap's", slug: "kit-diy-debutant", sku: "AV-DIY-001", category: "diy", imageUrl: IMG.accessory, priceCents: 2490, stock: 15, isNew: true, salesCount: 18 },
    { name: "Flacons gradués 10ml (x10)", slug: "flacons-gradues-10ml", sku: "AV-DIY-002", category: "diy", imageUrl: IMG.accessory, priceCents: 490, stock: 60, salesCount: 45 },
    { name: "Arôme Capella Blueberry 30ml", slug: "capella-blueberry-30ml", sku: "AV-ARO-001", category: "aromes", brand: "Capella", brandSlug: "capella", imageUrl: IMG.eliquid, priceCents: 890, stock: 40, salesCount: 55 },
    { name: "Arôme Vampire Vape Heisenberg 30ml", slug: "vampire-vape-heisenberg", sku: "AV-ARO-002", category: "aromes", brand: "Vampire Vape", brandSlug: "vampire-vape", imageUrl: IMG.eliquid, priceCents: 990, stock: 35, salesCount: 70 },
    { name: "Base DIY VPG 50/50 1L", slug: "base-diy-vpg-1l", sku: "AV-BAS-001", category: "bases", imageUrl: IMG.accessory, priceCents: 1290, stock: 40, salesCount: 35 },
    { name: "Base DIY VG 100% 1L", slug: "base-diy-vg-1l", sku: "AV-BAS-002", category: "bases", imageUrl: IMG.accessory, priceCents: 1190, stock: 45, salesCount: 30 },
    { name: "Booster Nicotine 20mg 10ml", slug: "booster-nicotine-20mg", sku: "AV-BOO-001", category: "boosters", imageUrl: IMG.eliquid, priceCents: 190, stock: 200, salesCount: 150 },
    { name: "Booster Nicotine 10mg 10ml", slug: "booster-nicotine-10mg", sku: "AV-BOO-002", category: "boosters", imageUrl: IMG.eliquid, priceCents: 190, stock: 180, salesCount: 130 },
    { name: "Chargeur Nitecore i2", slug: "nitecore-i2", sku: "AV-ACC-001", category: "accessoires", brand: "Nitecore", brandSlug: "nitecore", imageUrl: IMG.accessory, priceCents: 1590, stock: 20, salesCount: 28 },
    { name: "Étui de transport rigide", slug: "etui-transport-rigide", sku: "AV-ACC-002", category: "accessoires", imageUrl: IMG.accessory, priceCents: 990, stock: 30, salesCount: 15 },
    { name: "Accu Samsung 18650 25R", slug: "samsung-18650-25r", sku: "AV-BAT-001", category: "batteries", imageUrl: IMG.battery, priceCents: 890, stock: 50, salesCount: 80 },
    { name: "Accu Molicel P42A 21700", slug: "molicel-p42a-21700", sku: "AV-BAT-002", category: "batteries", imageUrl: IMG.battery, priceCents: 1290, stock: 35, salesCount: 45 },
    { name: "Chargeur Nitecore D4", slug: "nitecore-d4", sku: "AV-CHA-001", category: "chargeurs", brand: "Nitecore", brandSlug: "nitecore", imageUrl: IMG.accessory, priceCents: 2990, stock: 12, salesCount: 20 },
    { name: "Chargeur Xtar VC4", slug: "xtar-vc4", sku: "AV-CHA-002", category: "chargeurs", imageUrl: IMG.accessory, priceCents: 2490, stock: 15, salesCount: 18 },
    { name: "Verre Pyrex GeekVape Z", slug: "verre-geekvape-z", sku: "AV-VER-001", category: "verres", brand: "GeekVape", brandSlug: "geekvape", imageUrl: IMG.accessory, priceCents: 490, stock: 55, salesCount: 60 },
    { name: "Verre Pyrex Vaporesso iTank", slug: "verre-vaporesso-itank", sku: "AV-VER-002", category: "verres", brand: "Vaporesso", brandSlug: "vaporesso", imageUrl: IMG.accessory, priceCents: 590, stock: 48, salesCount: 52 },
    { name: "Drip Tip 810 Resine", slug: "drip-tip-810-resine", sku: "AV-DT-001", category: "drip-tips", imageUrl: IMG.accessory, priceCents: 790, stock: 40, salesCount: 25 },
    { name: "Drip Tip 510 Delrin", slug: "drip-tip-510-delrin", sku: "AV-DT-002", category: "drip-tips", imageUrl: IMG.accessory, priceCents: 590, stock: 45, salesCount: 30 },
  ];

  const products = productDefs.map((p, i) => ({
    id: prdId(p.slug),
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    description: `${p.name} — sélection premium All Vap's`,
    category: p.category,
    brand: p.brand || null,
    categoryId: catId(p.category),
    brandId: p.brandSlug ? brandId(p.brandSlug) : null,
    imageUrl: p.imageUrl,
    images: p.images || [],
    priceCents: p.priceCents,
    promoPriceCents: p.promoPriceCents || null,
    stock: p.stock,
    salesCount: p.salesCount || 0,
    isActive: true,
    isNew: p.isNew || false,
    isBestSeller: p.isBestSeller || false,
    isPromo: p.isPromo || false,
    createdAt: new Date(BASE.getTime() + i * 3600000),
    updatedAt: new Date(BASE.getTime() + i * 3600000),
  }));

  const users = [
    {
      id: "usr_admin",
      email: "admin@allvaps.fr",
      passwordHash: adminHash,
      firstName: "Admin",
      lastName: "All Vap's",
      phone: null,
      role: "ADMIN",
      loyaltyPoints: 0,
      qrCode: "qr_admin",
      createdAt: BASE,
      updatedAt: BASE,
    },
    {
      id: "usr_demo",
      email: "demo@allvaps.fr",
      passwordHash: demoHash,
      firstName: "Jean",
      lastName: "Dupont",
      phone: "0600000000",
      role: "CUSTOMER",
      loyaltyPoints: 150,
      qrCode: "qr_demo",
      createdAt: BASE,
      updatedAt: BASE,
    },
  ];

  const orderItems = [
    { id: "oi_1", orderId: "ord_1", productId: prdId("vaporesso-xros-3-mini"), quantity: 1, priceCents: 2490 },
    { id: "oi_2", orderId: "ord_1", productId: prdId("pulp-blue-slush-50ml"), quantity: 2, priceCents: 1490 },
    { id: "oi_3", orderId: "ord_2", productId: prdId("geekvape-aegis-legend-2"), quantity: 1, priceCents: 6990 },
  ];

  const orders = [
    {
      id: "ord_1",
      userId: "usr_demo",
      customerEmail: "demo@allvaps.fr",
      customerName: "Jean Dupont",
      status: "PAID",
      totalCents: 6470,
      discountCents: 0,
      couponCode: null,
      deliveryMethod: "COLISSIMO",
      pickupStoreId: null,
      shippingAddress: "12 rue de la Vape, 59330 Hautmont",
      paymentProvider: "VIVA",
      sumupCheckoutId: null,
      sumupPaymentId: null,
      vivaOrderCode: "VIVA-DEMO-001",
      vivaTransactionId: "txn_demo_1",
      loyaltyPointsUsed: 0,
      loyaltyPointsEarn: 64,
      createdAt: new Date("2024-06-15T14:00:00.000Z"),
      updatedAt: new Date("2024-06-15T14:05:00.000Z"),
    },
    {
      id: "ord_2",
      userId: "usr_demo",
      customerEmail: "demo@allvaps.fr",
      customerName: "Jean Dupont",
      status: "PENDING",
      totalCents: 7040,
      discountCents: 0,
      couponCode: null,
      deliveryMethod: "MONDIAL_RELAY",
      pickupStoreId: null,
      shippingAddress: "Point Relais Le Quesnoy",
      paymentProvider: "SUMUP",
      sumupCheckoutId: "sumup_demo_checkout",
      sumupPaymentId: null,
      vivaOrderCode: null,
      vivaTransactionId: null,
      loyaltyPointsUsed: 0,
      loyaltyPointsEarn: 70,
      createdAt: new Date("2024-06-20T10:00:00.000Z"),
      updatedAt: new Date("2024-06-20T10:00:00.000Z"),
    },
  ];

  return {
    users,
    categories,
    brands,
    products,
    orders,
    orderItems,
    favorites: [
      { id: "fav_1", userId: "usr_demo", productId: prdId("vaporesso-xros-3-mini"), createdAt: BASE },
      { id: "fav_2", userId: "usr_demo", productId: prdId("pulp-blue-slush-50ml"), createdAt: BASE },
    ],
    addresses: [
      {
        id: "addr_1",
        userId: "usr_demo",
        label: "Domicile",
        firstName: "Jean",
        lastName: "Dupont",
        street: "12 rue de la Vape",
        city: "Hautmont",
        postalCode: "59330",
        country: "FR",
        phone: "0600000000",
        isDefault: true,
        createdAt: BASE,
        updatedAt: BASE,
      },
    ],
    reviews: [
      { id: "rev_1", productId: prdId("vaporesso-xros-3-mini"), userId: "usr_demo", rating: 5, comment: "Excellent pod !", isApproved: true, createdAt: BASE, updatedAt: BASE },
      { id: "rev_2", productId: prdId("pulp-blue-slush-50ml"), userId: "usr_demo", rating: 4, comment: "Saveur incroyable.", isApproved: true, createdAt: BASE, updatedAt: BASE },
      { id: "rev_3", productId: prdId("geekvape-aegis-legend-2"), userId: "usr_demo", rating: 5, comment: "Box solide.", isApproved: false, createdAt: BASE, updatedAt: BASE },
    ],
    coupons: [
      { id: "cpn_1", code: "BIENVENUE10", description: "10% première commande", discountType: "PERCENT", value: 10, minOrderCents: 2000, maxUses: 1000, usedCount: 42, expiresAt: null, isActive: true, createdAt: BASE, updatedAt: BASE },
      { id: "cpn_2", code: "PROMO5", description: "5€ de réduction", discountType: "FIXED", value: 500, minOrderCents: 3000, maxUses: 100, usedCount: 8, expiresAt: null, isActive: true, createdAt: BASE, updatedAt: BASE },
    ],
    banners: [
      { id: "home-banner-1", title: "Nouveautés All Vap's", subtitle: "Découvrez notre sélection premium", imageUrl: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=1200&q=80", linkUrl: "/boutique?new=true", placement: "home", sortOrder: 0, isActive: true, createdAt: BASE, updatedAt: BASE },
      { id: "promo-banner-1", title: "Promotions du moment", subtitle: "Jusqu'à -30%", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80", linkUrl: "/promotions", placement: "home", sortOrder: 1, isActive: true, createdAt: BASE, updatedAt: BASE },
    ],
    passwordResetTokens: [],
    vapeProfiles: [
      {
        id: "vp_demo",
        userId: "usr_demo",
        status: "confirme",
        cigarettesPerDay: 10,
        drawPreference: "serre",
        preferredFlavors: ["fruite", "frais"],
        avoidedFlavors: ["classic"],
        advisedNicotineMg: 6,
        usedNicotineMg: 6,
        advisedProductIds: ["prd_vaporesso-xros-3-mini"],
        triedProductIds: ["prd_pulp-blue-slush-50ml", "prd_vaporesso-xros-3-mini"],
        averageBudgetCents: 3000,
        gdprConsent: true,
        personalizedEnabled: true,
        lastRecommendationAt: new Date("2024-06-18T12:00:00.000Z"),
        createdAt: BASE,
        updatedAt: BASE,
      },
    ],
    vapeRecommendations: [
      {
        id: "vr_1",
        userId: "usr_demo",
        productId: prdId("vaporesso-xros-3-mini"),
        reason: "adapté tirage serre, saveur fruitée",
        score: 45,
        source: "assistant",
        createdAt: new Date("2024-06-18T12:00:00.000Z"),
      },
      {
        id: "vr_2",
        userId: "usr_demo",
        productId: prdId("pulp-blue-slush-50ml"),
        reason: "saveurs fruitées et fraîches",
        score: 50,
        source: "engine",
        createdAt: new Date("2024-06-17T10:00:00.000Z"),
      },
    ],
  };
}

export function cloneDemoSeed(): DemoStore {
  return structuredClone(buildDemoSeed());
}
