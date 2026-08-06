/** Probe Cookin Cloud Myst + Cloud Vapor Zombie + MDS + Liquidarom Pastis 50ml */
async function probe(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    const html = (await res.text()).replace(/\\\//g, "/");
    const labels: string[] = [];
    for (const m of html.matchAll(
      /\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
    )) {
      labels.push(`${m[1]}|${m[2]}`);
    }
    for (const m of html.matchAll(
      /(?:src|data-src|data-image-large-src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/gi,
    )) {
      if (/myst|zombie|pastis|loving|snake|witch|mds|mojito/i.test(m[1]))
        labels.push(m[1].split("/").pop() || m[1]);
    }
    console.log("\n===", res.status, res.url, "===");
    console.log([...new Set(labels)].slice(0, 40));
  } catch (e) {
    console.log("FAIL", url, String(e));
  }
}

async function main() {
  const urls = [
    "https://www.cookincloud.com/recherche?controller=search&s=Myst",
    "https://www.cookincloud.com/recherche?controller=search&s=Da+Loving+Witch",
    "https://www.cookincloud.com/recherche?controller=search&s=loving+witch",
    "https://www.cloudvapor.com/recherche?controller=search&s=Zombie",
    "https://www.cloudvapor.com/",
    "https://www.mdsjuice.com/",
    "https://themdsjuice.fr/",
    "https://www.liquidarom.com/recherche?controller=search&s=Pastis+13+50ml",
    "https://www.liquidarom.com/recherche?controller=search&s=Pastis+13",
  ];
  for (const u of urls) await probe(u);
}

main();
