/**
 * Construit le fichier de référence produits vape FR (sites officiels fabricants).
 * Lecture seule — images publiques fabricants pour reconnaissance visuelle inventaire.
 *
 * Usage: npx tsx scripts/build-vape-fr-reference.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export type RefProduct = {
  id: string;
  name: string;
  brand: string;
  range: string | null;
  barcode: string | null;
  imageUrl: string | null;
  source: string;
  country: "FR";
};

const BRANDS: Array<{ brand: string; domains: string[]; queries: string[] }> = [
  {
    brand: "Liquidarom",
    domains: ["www.liquidarom.com", "liquidarom.com"],
    queries: [
      "menthe",
      "fraise",
      "fruits",
      "tabac",
      "vanille",
      "ice",
      "cassis",
      "peche",
      "pomme",
      "citron",
      "orange",
      "raisin",
      "cola",
      "cafe",
      "caramel",
      "blend",
      "selad",
      "vegetol",
      "essentiels",
      "tasty",
    ],
  },
  {
    brand: "E-Tasty",
    domains: ["e-tasty.fr", "www.e-tasty.fr"],
    queries: ["fruizee", "adess", "liquideo", "menthe", "fraise", "fruits", "classic"],
  },
  {
    brand: "Juice 66",
    domains: ["www.vapair.pro", "vapair.pro"],
    queries: ["hiro", "run", "empire", "senku", "menthe", "fraise", "fruits"],
  },
  {
    brand: "Pulp",
    domains: ["www.pulp.fr", "pulp.fr", "boutique.pulp.fr"],
    queries: ["menthe", "fraise", "fruits", "classic", "vanille", "peche"],
  },
  {
    brand: "Alfaliquid",
    domains: ["www.alfaliquid.com", "alfaliquid.com"],
    queries: ["menthe", "fraise", "fruits", "classic", "gauloise"],
  },
  {
    brand: "Le French Liquide",
    domains: ["www.lefrenchliquide.com", "lefrenchliquide.com"],
    queries: ["menthe", "fraise", "fruits", "classic", "diy"],
  },
  {
    brand: "Curieux",
    domains: ["www.curieux.fr", "curieux.fr"],
    queries: ["menthe", "fraise", "fruits", "classic"],
  },
  {
    brand: "Vape 47",
    domains: ["www.vape47.com", "vape47.com"],
    queries: ["furiosa", "apozem", "menthe", "winter", "fruits"],
  },
];

async function fetchText(url: string, timeoutMs = 9000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "AllVaps-Inventory/1.0 (+reference-build; official-catalog)",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function absUrl(href: string, domain: string): string | null {
  try {
    if (!href || href.startsWith("data:")) return null;
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("http")) return href;
    const host = domain.replace(/^www\./, "");
    if (href.startsWith("/")) return `https://www.${host}${href}`;
    return `https://www.${host}/${href}`;
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseProducts(html: string, brand: string, domain: string): RefProduct[] {
  const out: RefProduct[] = [];
  const seen = new Set<string>();
  const host = domain.replace(/^www\./, "");

  const miniRe =
    /product-miniature[^>]*data-id-product="(\d+)"[\s\S]*?<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = miniRe.exec(html)) && out.length < 40) {
    const block = m[0];
    const id = m[1];
    const titleRaw =
      (block.match(
        /(?:product-title|product-name)[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
      ) ||
        block.match(/<h[23][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
        [])[1] || "";
    const name = stripTags(titleRaw).slice(0, 160);
    if (!name || name.length < 4) continue;
    if (/catalogue|accueil|panier|compte|\.pdf/i.test(name)) continue;
    const key = `${brand}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const imageUrl =
      absUrl(
        block.match(/data-full-size-image-url\s*=\s*["']([^"']+)["']/i)?.[1] ||
          block.match(/data-src\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1] ||
          block.match(/src\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1] ||
          "",
        host
      ) || null;

    let range: string | null = null;
    if (name.includes(" - ")) {
      const part = name.split(" - ").pop()?.trim() || "";
      if (part && part.length < 40 && part.toLowerCase() !== brand.toLowerCase()) {
        range = part;
      }
    }

    out.push({
      id: `ref-${host}-${id}`,
      name,
      brand,
      range,
      barcode: null,
      imageUrl,
      source: `official:${host}`,
      country: "FR",
    });
  }

  // JSON-LD Product
  const ldRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html))) {
    try {
      const raw = JSON.parse(ld[1]);
      const nodes = Array.isArray(raw) ? raw : [raw];
      for (const node of nodes) {
        const list = Array.isArray(node["@graph"]) ? node["@graph"] : [node];
        for (const item of list) {
          if (!/Product/i.test(String(item["@type"] || ""))) continue;
          const name = stripTags(String(item.name || "")).slice(0, 160);
          if (!name) continue;
          const key = `${brand}|${name.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const img =
            absUrl(
              String(
                (Array.isArray(item.image) ? item.image[0] : item.image) || ""
              ),
              host
            ) || null;
          out.push({
            id: `ref-ld-${host}-${out.length}`,
            name,
            brand,
            range: null,
            barcode: String(item.gtin13 || item.gtin || item.sku || "") || null,
            imageUrl: img,
            source: `official:${host}`,
            country: "FR",
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}

const SEARCH_PATHS = (q: string) => [
  `/recherche?controller=search&s=${encodeURIComponent(q)}`,
  `/search?controller=search&s=${encodeURIComponent(q)}`,
  `/search?q=${encodeURIComponent(q)}`,
  `/?s=${encodeURIComponent(q)}`,
];

async function harvestBrand(row: (typeof BRANDS)[0]): Promise<RefProduct[]> {
  const all: RefProduct[] = [];
  const seen = new Set<string>();
  for (const domain of row.domains) {
    for (const q of row.queries) {
      for (const path of SEARCH_PATHS(q)) {
        const html = await fetchText(`https://${domain}${path}`);
        if (!html || html.length < 1000) continue;
        const hits = parseProducts(html, row.brand, domain);
        for (const h of hits) {
          const key = `${h.brand}|${h.name.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(h);
        }
        if (hits.length) break;
      }
      if (all.length >= 120) break;
    }
    if (all.length >= 80) break;
  }
  return all;
}

async function main() {
  const products: RefProduct[] = [];
  const byBrand: Record<string, number> = {};

  for (const brand of BRANDS) {
    process.stdout.write(`→ ${brand.brand}… `);
    const hits = await harvestBrand(brand);
    byBrand[brand.brand] = hits.length;
    products.push(...hits);
    console.log(`${hits.length} produits`);
  }

  // Dédup final
  const seen = new Set<string>();
  const unique: RefProduct[] = [];
  for (const p of products) {
    const key = `${p.brand}|${p.name.toLowerCase()}|${p.imageUrl || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  const withImage = unique.filter((p) => p.imageUrl).length;
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    country: "FR",
    description:
      "Référence produits vape FR (sites officiels fabricants) pour reconnaissance visuelle inventaire All Vap's. Images en lecture seule.",
    brands: byBrand,
    total: unique.length,
    withImage,
    products: unique,
  };

  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, "vape-fr-reference-products.json");
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  // Copie publique légère (sans trop grossir) pour accès client si besoin
  const publicDir = join(process.cwd(), "public", "data");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, "vape-fr-reference-products.json"),
    JSON.stringify(payload),
    "utf8"
  );

  console.log(`\nOK ${unique.length} produits (${withImage} avec image) → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
