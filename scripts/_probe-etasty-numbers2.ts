/** Probe exact Numbers 5-9 30ml and United 50ml image labels on e-tasty.fr */
async function probe(q: string) {
  const url = `https://www.e-tasty.fr/recherche?controller=search&s=${encodeURIComponent(q)}`;
  const html = (await (await fetch(url, { headers: { "User-Agent": "AllVapsBot/1" } })).text()).replace(
    /\\\//g,
    "/",
  );
  const labels: string[] = [];
  for (const m of html.matchAll(
    /(?:https?:\/\/(?:www\.)?e-tasty\.fr)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
  )) {
    labels.push(`${m[1]}|${m[2]}`);
  }
  console.log("\n===", q, "===");
  console.log([...new Set(labels)].filter((l) => /numbers|united|vinc|malice/i.test(l)).slice(0, 40));
}

async function main() {
  for (const q of [
    "Numbers 5 - 30ml",
    "Numbers 6 - 30ml",
    "Numbers 7 - 30ml",
    "Numbers 8 - 30ml",
    "Numbers 9 - 30ml",
    "numbers-5-30ml",
    "numbers-7-30ml",
    "United 50ml",
    "united-50ml",
  ]) {
    await probe(q);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
