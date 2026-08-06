/**
 * Scrape complet One Taste 10 ml (toutes pages PrestaShop).
 */
import fs from "node:fs";
import path from "node:path";

type Item = {
  title: string;
  flavorKey: string;
  imageUrl: string;
  productUrl: string;
  ean: string | null;
  isSalt: boolean;
};

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

function flavorFromTitle(title: string): string {
  return norm(
    title
      .replace(/one\s*taste/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/sel(s)?\s*(de\s*)?nicotine/gi, " ")
      .replace(/\bsels?\b/gi, " ")
  );
}

function imageMatchesFlavor(imageUrl: string, flavorKey: string): boolean {
  const file = norm(path.basename(imageUrl).replace(/\.[a-z0-9]+$/i, ""));
  const fTokens = flavorKey.split(" ").filter((t) => t.length > 2);
  if (!fTokens.length) return false;
  const hits = fTokens.filter((t) => file.includes(t));
  return hits.length >= Math.ceil(fTokens.length * 0.5);
}

async function fetchPage(page: number): Promise<string> {
  const url =
    page <= 1
      ? "https://pro.e-tasty.fr/15_one-taste"
      : `https://pro.e-tasty.fr/15_one-taste?page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function parse(html: string): Item[] {
  const blocks = [...html.matchAll(/<article[^>]*class="[^"]*product-miniature[^"]*"[\s\S]*?<\/article>/gi)];
  const out: Item[] = [];
  for (const b of blocks) {
    const chunk = b[0];
    const title =
      chunk.match(/itemprop="name"[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      chunk.match(/alt="([^"]+)"/i)?.[1]?.trim();
    const productUrl =
      chunk.match(/href="(https:\/\/pro\.e-tasty\.fr\/[^"#]+)"/i)?.[1] ||
      (chunk.match(/href="(\/[^"#]+\.html)"/i)
        ? `https://pro.e-tasty.fr${chunk.match(/href="(\/[^"#]+\.html)"/i)![1]}`
        : "");
    const imageUrl =
      chunk.match(/data-full-size-image-url="([^"]+)"/i)?.[1] ||
      chunk.match(/src="(https:\/\/pro\.e-tasty\.fr\/\d+-[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1];
    if (!title || !imageUrl) continue;
    const is10 =
      /10\s*ml/i.test(title) ||
      /10ml|10-ml/i.test(imageUrl) ||
      /10ml|10-ml/i.test(productUrl);
    if (!is10) continue;
    const flavorKey = flavorFromTitle(title);
    if (!flavorKey) continue;
    // Skip mismatched image/title pairs
    if (!imageMatchesFlavor(imageUrl, flavorKey)) {
      // keep if product URL matches
      const urlOk = flavorKey
        .split(" ")
        .filter((t) => t.length > 2)
        .some((t) => norm(productUrl).includes(t));
      if (!urlOk) continue;
    }
    out.push({
      title: title.replace(/\s+/g, " ").trim(),
      flavorKey,
      imageUrl,
      productUrl,
      ean: productUrl.match(/(37\d{11})/)?.[1] || null,
      isSalt: /sel/i.test(title) || /sels-de-nicotine/i.test(productUrl),
    });
  }
  return out;
}

async function main() {
  const all: Item[] = [];
  for (let page = 1; page <= 8; page++) {
    const html = await fetchPage(page);
    const items = parse(html);
    console.log(`page ${page}: ${items.length}`);
    if (items.length === 0 && page > 1) break;
    all.push(...items);
    await new Promise((r) => setTimeout(r, 400));
  }
  const seen = new Set<string>();
  const deduped = all.filter((o) => {
    const k = `${o.flavorKey}|${o.isSalt}|${o.imageUrl}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Also by flavor+salt only
  const byFlavor = new Map<string, Item>();
  for (const o of deduped) {
    const k = `${o.flavorKey}|${o.isSalt}`;
    const existing = byFlavor.get(k);
    if (!existing || imageMatchesFlavor(o.imageUrl, o.flavorKey)) byFlavor.set(k, o);
  }
  const items = [...byFlavor.values()];
  const out = path.resolve("data/rebuild/ETASTY_ONE_TASTE_10ML_OFFICIAL.json");
  fs.writeFileSync(
    out,
    JSON.stringify({ date: new Date().toISOString(), count: items.length, items }, null, 2)
  );
  console.log(JSON.stringify({ count: items.length, sample: items.slice(0, 15).map((i) => i.title) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
