async function main() {
  const html = await (await fetch("http://localhost:3000/boutique/twenty-double-peche-20ml")).text();
  const checks = [
    "formats/20ml",
    "Retour aux e-liquides",
    "fabricants/e-tasty",
    "gammes/twenty",
    "DOUBLE PECHE",
    "border-brand-500 text-brand-400",
  ];
  for (const c of checks) console.log(c, "→", html.includes(c));

  const formatsOk = await (await fetch("http://localhost:3000/formats/20ml")).text();
  console.log(
    "formats page E-LIQUIDES active →",
    /href="\/e-liquides"[^>]*border-brand-500 text-brand-400/.test(formatsOk) ||
      /border-brand-500 text-brand-400"[^>]*href="\/e-liquides"/.test(formatsOk) ||
      formatsOk.includes('href="/e-liquides"') && formatsOk.includes("border-brand-500 text-brand-400")
  );

  for (const slug of [
    "twenty-double-peche-20ml",
    "twenty-fruits-rouges-20ml",
    "twenty-menthe-polaire-20ml",
    "twenty-fruit-du-dragon-cerise-20ml",
    "twenty-limonade-citron-cassis-20ml",
  ]) {
    const r = await fetch(`http://localhost:3000/boutique/${slug}`);
    const t = await r.text();
    console.log(slug, r.status, t.includes("Une erreur est survenue") ? "ERROR_PAGE" : "OK");
  }
}

main();
