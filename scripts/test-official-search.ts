import { searchExternalProducts } from "../lib/inventory/external-product-search";

const cases = [
  { query: "liquidarom menthe polaire", brandHint: "Liquidarom" },
  { query: "e-tasty fruizee", brandHint: "E-Tasty" },
  { query: "liquidelab fruits", brandHint: "LiquideLab" },
  { query: "vape 47 menthe", brandHint: "Vape 47" },
  { query: "juice 66 hiro", brandHint: "Juice 66" },
];

async function main() {
  let ok = 0;
  for (const c of cases) {
    const t0 = Date.now();
    const r = await searchExternalProducts(c);
    const top = r.hits[0];
    const pass = Boolean(top && !/catalogue|fabricant|commandes/i.test(top.name));
    if (pass) ok += 1;
    console.log(
      JSON.stringify({
        q: c.query,
        pass,
        ms: Date.now() - t0,
        n: r.hits.length,
        top: top
          ? {
              name: top.name,
              brand: top.brand,
              source: top.source,
              img: Boolean(top.imageUrl),
              imageUrl: top.imageUrl,
            }
          : null,
      })
    );
  }
  console.log(`PASS ${ok}/${cases.length}`);
  if (ok < 3) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
