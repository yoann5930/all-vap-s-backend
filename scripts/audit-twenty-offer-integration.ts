/**
 * Contrôle d'intégration offre Twenty + photos + AVA.
 * npx tsx scripts/audit-twenty-offer-integration.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { quoteTwentyPaidQuantity, isPromoTwentyEligible } from "../lib/promotions/promo-twenty";
import { isShopOfferQuestion } from "../lib/ava/shop-offers";
import { rangeCoverUrl } from "../lib/catalog/range-cover";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_MD = path.join(REPO_ROOT, "data/rebuild/RAPPORT_OFFRE_TWENTY.md");

function loadEnvFile(file: string): Record<string, string> {
  const raw = fs.readFileSync(file, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function extractPostgresUrl(raw: string): string {
  let v = raw.trim().replace(/^\uFEFF/, "");
  const embedded = v.match(/postgres(?:ql)?:\/\/\S+/i);
  if (embedded) return embedded[0].replace(/[.,;]+$/, "");
  return v;
}

function existsPublic(rel: string): { ok: boolean; bytes: number } {
  const abs = path.join(REPO_ROOT, "public", rel.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return { ok: false, bytes: 0 };
  return { ok: fs.statSync(abs).size > 500, bytes: fs.statSync(abs).size };
}

function fileContains(rel: string, needle: string): boolean {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return false;
  return fs.readFileSync(abs, "utf8").includes(needle);
}

async function main() {
  const checks: Array<{ id: string; ok: boolean; detail: string }> = [];

  checks.push({
    id: "paliers",
    ok:
      quoteTwentyPaidQuantity(1).payCents === 1290 &&
      quoteTwentyPaidQuantity(5).payCents === 3950 &&
      quoteTwentyPaidQuantity(6).freeExtra === 1 &&
      quoteTwentyPaidQuantity(10).freeExtra === 5,
    detail: "Paliers 1 / 5 / 6 / 10",
  });
  checks.push({
    id: "ava-detect",
    ok: isShopOfferQuestion("Quelle est l'offre dégressive Twenty avant paiement ?"),
    detail: "A.V.A. détecte la question offre Twenty",
  });

  const wiring: Array<[string, string, string]> = [
    ["lib/promotions/promo-twenty.ts", "TWENTY_TIERS", "moteur paliers"],
    ["lib/promotions/cart-promos.ts", "calculatePromoTwenty", "panier combiné"],
    ["app/cart/page.tsx", "applyCartPromos", "page panier"],
    ["app/checkout/page.tsx", "AvaOfferVerification", "checkout + AVA"],
    ["app/api/orders/route.ts", "promoTwenty", "commande serveur"],
    ["app/api/ava/verify-checkout/route.ts", "avaMessage", "API vérif AVA"],
    ["lib/ai/ava-advisor.ts", "isShopOfferQuestion", "chat A.V.A."],
    ["data/ava/knowledge/faq.json", "faq-offre-twenty", "FAQ AVA"],
    ["app/gammes/[slug]/page.tsx", "TwentyOfferBanner", "page gamme"],
    ["app/offres/page.tsx", "TwentyOfferBanner", "menu Offres"],
    ["app/offres/twenty/page.tsx", "Twenty 20 ml", "page offre Twenty"],
    ["lib/navigation.ts", 'href: "/offres"', "nav OFFRES"],
    ["components/products/ProductCard.tsx", "showPromoTwenty", "cartes PC/mobile"],
    ["components/products/ProductPurchasePanel.tsx", "TwentyOfferBanner", "fiche produit"],
  ];
  for (const [file, needle, label] of wiring) {
    const ok = fileContains(file, needle);
    checks.push({ id: `wire:${file}`, ok, detail: `${label} — ${file}` });
  }

  const logo = existsPublic("/media/manufacturers/e-tasty/logo.webp");
  const coverRel = rangeCoverUrl("e-tasty", "twenty");
  const cover = coverRel ? existsPublic(coverRel) : { ok: false, bytes: 0 };
  checks.push({
    id: "logo",
    ok: logo.ok,
    detail: `logo fabricant e-tasty (${logo.bytes} o)`,
  });
  checks.push({
    id: "cover",
    ok: cover.ok,
    detail: `cover gamme ${coverRel || "ABSENT"} (${cover.bytes} o)`,
  });

  const envPath = path.join(REPO_ROOT, ".env.render.audit");
  const env = loadEnvFile(envPath);
  const prisma = new PrismaClient({
    datasources: { db: { url: extractPostgresUrl(env.DATABASE_URL || "") } },
    log: ["error"],
  });

  const photoRows: Array<Record<string, unknown>> = [];
  try {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database() AS current_database
    `;
    checks.push({
      id: "db",
      ok: db[0]?.current_database === "all_vaps_db",
      detail: "base all_vaps_db",
    });

    const products = await prisma.product.findMany({
      where: {
        OR: [{ productFamily: "ETASTY_TWENTY" }, { rangeRef: { slug: "twenty" } }],
      },
      select: {
        name: true,
        slug: true,
        barcode: true,
        imageUrl: true,
        imageStatus: true,
        priceCents: true,
        volumeMl: true,
        productType: true,
        visibleOnline: true,
        catalogStatus: true,
        sumupProductId: true,
        productFamily: true,
        promotion10mlEligible: true,
      },
      orderBy: { name: "asc" },
    });

    checks.push({
      id: "count",
      ok: products.length === 5,
      detail: `${products.length} fiches Twenty (attendu 5)`,
    });

    for (const p of products) {
      const file = p.imageUrl ? existsPublic(p.imageUrl) : { ok: false, bytes: 0 };
      const eligible = isPromoTwentyEligible({
        name: p.name,
        productFamily: p.productFamily,
        rangeSlug: "twenty",
        volumeMl: p.volumeMl,
        productType: p.productType,
        visibleOnline: p.visibleOnline,
        isActive: true,
        catalogStatus: p.catalogStatus,
        stock: 1,
      });
      const photoOk =
        file.ok &&
        (p.imageStatus === "official" || p.imageStatus === "validated") &&
        !!p.imageUrl &&
        p.imageUrl.includes("/media/");
      photoRows.push({
        name: p.name,
        slug: p.slug,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        imageStatus: p.imageStatus,
        bytes: file.bytes,
        photoOk,
        eligible,
        priceCents: p.priceCents,
        volumeMl: p.volumeMl,
        published: p.visibleOnline && p.catalogStatus === "valide",
        sumup: !!p.sumupProductId,
        not10ml: p.promotion10mlEligible === false,
        pcMobile:
          "ProductCard + grille 2 col. mobile / 4 col. desktop, object-contain, /media/products pré-optimisé",
      });
      checks.push({
        id: `photo:${p.slug}`,
        ok: photoOk,
        detail: `${p.name} — ${p.imageUrl || "sans image"} (${p.imageStatus})`,
      });
      checks.push({
        id: `elig:${p.slug}`,
        ok: eligible && p.priceCents === 1290 && p.volumeMl === 20,
        detail: `${p.name} éligible offre + 12,90 € + 20 ml`,
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const failed = checks.filter((c) => !c.ok);
  const md = [
    `# Rapport d'intégration — offre dégressive Twenty`,
    ``,
    `- Date : ${new Date().toISOString()}`,
    `- Contrôles : ${checks.filter((c) => c.ok).length}/${checks.length} OK`,
    `- Échecs : ${failed.length}`,
    ``,
    `## Offre (panier / paiement, prix catalogue inchangé 12,90 €)`,
    ``,
    `| Qté | Prix / unité | Offert (livré en plus) |`,
    `| --- | --- | --- |`,
    `| 1 | 12,90 € | — |`,
    `| 2 | 11,90 € | — |`,
    `| 3 | 10,90 € | — |`,
    `| 4 | 9,90 € | — |`,
    `| 5 | 7,90 € | — |`,
    `| 6 | 8,90 € | + 1 |`,
    `| 7 | 8,90 € | + 2 |`,
    `| 8 | 8,90 € | + 3 |`,
    `| 9 | 8,90 € | + 4 |`,
    `| 10 | 8,90 € | + 5 |`,
    ``,
    `Saveurs Twenty cumulées. Au-delà de 10 : packs de 10 + palier du reste.`,
    `Source de vérité paiement : \`app/api/orders/route.ts\` + vérification A.V.A. \`/api/ava/verify-checkout\`.`,
    ``,
    `## A.V.A.`,
    ``,
    `- FAQ \`faq-offre-twenty\` + article \`offre-twenty-degressive\``,
    `- Chat : détection offre Twenty dans \`lib/ai/ava-advisor.ts\``,
    `- Checkout : bloc « A.V.A. — vérification avant paiement »`,
    ``,
    `## Implantation UI PC / mobile`,
    ``,
    `- \`/gammes/twenty\` — bannière paliers + cartes 2 colonnes mobile / 4 desktop`,
    `- \`/offres\` — menu Offres (10 ml dégressive + Twenty), pas une promo catalogue`,
    `- \`/offres/twenty\` — paliers + fiches Twenty`,
    `- Fiche produit — \`TwentyOfferBanner\` compact`,
    `- Panier / checkout — remise + flacons offerts`,
    `- Photos : \`ProductCard\` \`object-contain\`, \`sizes=(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px\`, packshots \`/media/products\` non recompressés`,
    ``,
    `## Photos — validation`,
    ``,
    `| Produit | EAN | imageUrl | imageStatus | Fichier | Offre |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...photoRows.map((p) => {
      const file = p.photoOk ? `OK ${p.bytes} o` : "MANQUANT";
      return `| ${p.name} | ${p.barcode || "—"} | \`${p.imageUrl || ""}\` | ${p.imageStatus} | ${file} | ${p.eligible ? "oui" : "non"} |`;
    }),
    ``,
    `- Logo fabricant : ${logo.ok ? "OK" : "MANQUANT"} \`/media/manufacturers/e-tasty/logo.webp\``,
    `- Cover gamme : ${cover.ok ? "OK" : "MANQUANT"} \`${coverRel || "—"}\``,
    `- Sources packshots : pro.e-tasty.fr (EAN officiels Twenty 20 ml)`,
    `- Style : \`ensureProductImageEtastyStyle\` (fond noir, cutout)`,
    ``,
    `## Checklist fichiers`,
    ``,
    ...checks.map((c) => `- [${c.ok ? "x" : " "}] ${c.detail}`),
    ``,
    failed.length
      ? `## Échecs\n${failed.map((f) => `- ${f.detail}`).join("\n")}`
      : `## Échecs\nAucun`,
  ].join("\n");

  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  fs.writeFileSync(REPORT_MD, md, "utf8");
  console.log(md);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
