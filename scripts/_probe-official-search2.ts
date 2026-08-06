async function dumpMatches(url: string, patterns: RegExp[]) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
    signal: AbortSignal.timeout(25000),
  });
  const html = await res.text();
  console.log("\n===", url, res.status);
  for (const p of patterns) {
    const hits = [...html.matchAll(p)].slice(0, 8);
    console.log("pattern", p.source, "hits", hits.length);
    for (const h of hits) console.log(" ", h[0].slice(0, 160));
  }
  // product links
  const links = [...html.matchAll(/href="([^"]+\d+\.html)"/gi)].map((m) => m[1]).slice(0, 15);
  console.log("product links", links);
}

async function main() {
  const pats = [
    /https?:\/\/order\.vape47\.com\/\d+-[a-z0-9_]+\/[a-z0-9-]+\.(?:jpe?g|png|webp)/gi,
    /\/\d+-[a-z0-9_]+\/[a-z0-9-]+\.(?:jpe?g|png|webp)/gi,
    /data-id-product="(\d+)"/gi,
  ];
  await dumpMatches(
    "https://order.vape47.com/recherche?controller=search&s=enfer+green",
    pats,
  );
  await dumpMatches(
    "https://www.liquidarom.com/recherche?controller=search&s=La+Coquette",
    [
      /\/\d+-[a-z0-9_]+\/[a-z0-9-]+\.(?:jpe?g|png|webp)/gi,
      /href="([^"]*coquette[^"]*)"/gi,
      /href="(\/\d+-[^"]+\.html)"/gi,
    ],
  );
}

main().catch(console.error);
