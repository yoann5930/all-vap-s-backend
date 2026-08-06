async function main() {
  const q = "Numbers+7";
  const url = `https://www.e-tasty.fr/recherche?controller=search&s=${q}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
    signal: AbortSignal.timeout(25000),
  });
  const html = (await res.text()).replace(/\\\//g, "/");
  const labels = [
    ...html.matchAll(
      /\/(\d+)-(?:home_default_2x|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
    ),
  ].map((m) => `${m[1]}|${m[2]}`);
  console.log("Numbers7 labels", [...new Set(labels)].slice(0, 30));

  const url2 = `https://www.e-tasty.fr/recherche?controller=search&s=United`;
  const res2 = await fetch(url2, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
    signal: AbortSignal.timeout(25000),
  });
  const html2 = (await res2.text()).replace(/\\\//g, "/");
  const labels2 = [
    ...html2.matchAll(
      /\/(\d+)-(?:home_default_2x|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
    ),
  ].map((m) => m[2]);
  console.log(
    "United labels",
    [...new Set(labels2)].filter((x) => /united|one|taste/i.test(x)),
  );
}
main();
