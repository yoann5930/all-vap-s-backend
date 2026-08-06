async function probe(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
    signal: AbortSignal.timeout(25000),
  });
  const html = await res.text();
  console.log("\n===", url, res.status, html.length);
  const imgs = [...html.matchAll(/https?:[^"'\s>]+\.(?:jpe?g|png|webp)/gi)]
    .map((m) => m[0])
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, 12);
  console.log(imgs.join("\n"));
}

async function main() {
  await probe("https://www.liquidarom.com/recherche?controller=search&s=coquette");
  await probe("https://order.vape47.com/recherche?controller=search&s=enfer+green");
  await probe("https://www.e-tasty.fr/recherche?controller=search&s=Numbers+1");
  await probe("https://www.ranekiliquide.fr/");
}

main().catch(console.error);
