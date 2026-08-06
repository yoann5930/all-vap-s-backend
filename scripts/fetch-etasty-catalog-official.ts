/**
 * Lecture seule — scrapes pro.e-tasty.fr pour inventaire gammes / produits / images.
 * Ne télécharge rien. Ne modifie pas la DB.
 */
import fs from "node:fs";
import path from "node:path";

const BRAND_PAGES: Array<{ slug: string; path: string; name: string }> = [
  { slug: "one-taste", path: "/15_one-taste", name: "One Taste" },
  { slug: "bankiz", path: "/20_bankiz", name: "Bankiz" },
  { slug: "inspiration", path: "/21_inspiration", name: "Inspiration" },
  { slug: "god-fall-city", path: "/22_god-fall-city", name: "God Fall City" },
  { slug: "smoke-wars", path: "/23_smoke-wars", name: "Smoke Wars" },
  { slug: "gang-organise", path: "/24_gang-organise", name: "Gang Organisé" },
];

async function fetchHtml(urlPath: string): Promise<{ status: number; html: string; url: string }> {
  const url = `https://pro.e-tasty.fr${urlPath}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0 (catalog verification; read-only)" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  return { status: res.status, html: await res.text(), url: res.url };
}

function extractProducts(html: string) {
  const products: Array<{
    title: string;
    imageUrl: string | null;
    productUrl: string | null;
  }> = [];

  // PrestaShop product miniature pattern
  const blocks = [
    ...html.matchAll(
      /<article[^>]*class="[^"]*product-miniature[^"]*"[\s\S]*?<\/article>/gi
    ),
  ];

  for (const block of blocks) {
    const chunk = block[0];
    const title =
      chunk.match(/itemprop="name"[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      chunk.match(/title="([^"]+)"/i)?.[1]?.trim() ||
      chunk.match(/alt="([^"]+)"/i)?.[1]?.trim() ||
      null;
    const imageUrl =
      chunk.match(/data-full-size-image-url="([^"]+)"/i)?.[1] ||
      chunk.match(/data-src="([^"]+)"/i)?.[1] ||
      chunk.match(/src="(https:\/\/pro\.e-tasty\.fr[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1] ||
      null;
    const productUrl =
      chunk.match(/href="(https:\/\/pro\.e-tasty\.fr\/[^"]+)"/i)?.[1] ||
      chunk.match(/href="(\/\d+-[^"]+\.html)"/i)?.[1] ||
      null;
    if (title) {
      products.push({
        title: title.replace(/\s+/g, " ").trim(),
        imageUrl: imageUrl ? imageUrl.replace(/\/\//g, "/").replace("https:/", "https://") : null,
        productUrl: productUrl
          ? productUrl.startsWith("http")
            ? productUrl
            : `https://pro.e-tasty.fr${productUrl}`
          : null,
      });
    }
  }

  // Fallback: alt/title containing ONE Taste / Bankiz etc.
  if (products.length === 0) {
    const alts = [...html.matchAll(/alt="((?:ONE Taste|Bankiz|Inspiration|God|Smoke|Gang)[^"]{3,120})"/gi)];
    const imgs = [...html.matchAll(/data-full-size-image-url="([^"]+)"/gi)].map((m) => m[1]);
    alts.forEach((m, i) => {
      products.push({
        title: m[1].replace(/\s+/g, " ").trim(),
        imageUrl: imgs[i] || null,
        productUrl: null,
      });
    });
  }

  // Dedupe by title
  const seen = new Set<string>();
  return products.filter((p) => {
    const k = p.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function discoverBrandPaths(homeHtml: string) {
  const links = [
    ...homeHtml.matchAll(/href="(https:\/\/pro\.e-tasty\.fr\/\d+_[^"#]+|\/\d+_[^"#]+)"/gi),
  ].map((m) => {
    const href = m[1].startsWith("http") ? m[1] : `https://pro.e-tasty.fr${m[1]}`;
    const pathOnly = href.replace("https://pro.e-tasty.fr", "");
    const nameGuess = decodeURIComponent(pathOnly.split("_").slice(1).join("_").replace(/-/g, " "));
    return { path: pathOnly, href, nameGuess };
  });
  const uniq = new Map<string, { path: string; href: string; nameGuess: string }>();
  for (const l of links) uniq.set(l.path, l);
  return [...uniq.values()];
}

async function main() {
  const home = await fetchHtml("/");
  const discovered = await discoverBrandPaths(home.html);

  const report: any = {
    date: new Date().toISOString(),
    homeStatus: home.status,
    discoveredBrandPaths: discovered,
    ranges: [] as any[],
  };

  // Try known paths + discovered
  const toFetch = new Map<string, { path: string; name: string; slug: string }>();
  for (const b of BRAND_PAGES) toFetch.set(b.path, b);
  for (const d of discovered) {
    if (!toFetch.has(d.path)) {
      const slug = d.path
        .replace(/^\//, "")
        .replace(/^\d+_/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      toFetch.set(d.path, { path: d.path, name: d.nameGuess, slug });
    }
  }

  for (const b of toFetch.values()) {
    const page = await fetchHtml(b.path);
    const products = page.status === 200 ? extractProducts(page.html) : [];
    report.ranges.push({
      requested: b,
      finalUrl: page.url,
      status: page.status,
      productCount: products.length,
      products: products.slice(0, 200),
      sampleHtmlHint:
        page.status !== 200
          ? null
          : {
              hasMiniature: /product-miniature/i.test(page.html),
              titleMatch: (page.html.match(/ONE Taste|Bankiz|Inspiration|God Fall|Smoke Wars|Gang/gi) || []).slice(0, 5),
            },
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  const out = path.resolve("data/rebuild/ETASTY_OFFICIAL_SCRAPE.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        out,
        discovered: discovered.length,
        ranges: report.ranges.map((r: any) => ({
          name: r.requested.name,
          path: r.requested.path,
          status: r.status,
          products: r.productCount,
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
