/** Probe Liquide Lab official image sources */
const CANDIDATES = [
  "https://www.liquidelab.com/",
  "https://liquidelab.com/",
  "https://www.liquidelab.com/recherche?controller=search&s=Iceberg",
  "https://liquidelab.com/recherche?controller=search&s=Iceberg",
  "https://www.eliquidandco.com/recherche?controller=search&s=Iceberg+Mangue+LiquideLab",
];

async function probe(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    const html = (await res.text()).replace(/\\\//g, "/");
    const imgs: string[] = [];
    for (const m of html.matchAll(
      /(?:src|data-src|data-image-large-src|href)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/gi,
    )) {
      const u = m[1];
      if (/logo|banner|icon|sprite|flag/i.test(u)) continue;
      if (/iceberg|glagla|peche|gourmand|dragon|mangue|ananas/i.test(u)) imgs.push(u);
    }
    for (const m of html.matchAll(
      /\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
    )) {
      imgs.push(`${m[1]}|${m[2]}`);
    }
    console.log("\n===", res.status, url, "===");
    console.log("finalURL", res.url);
    console.log("title", (html.match(/<title[^>]*>([^<]+)/i) || [])[1]);
    console.log("hits", [...new Set(imgs)].slice(0, 30));
  } catch (e) {
    console.log("FAIL", url, String(e));
  }
}

async function main() {
  for (const u of CANDIDATES) await probe(u);
}

main();
