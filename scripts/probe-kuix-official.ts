/**
 * Probe site officiel Liquide Lab / Kuix pour URLs produits + images.
 */
async function main() {
  const seeds = [
    "https://liquidelab.com/",
    "https://liquidelab.com/kuix",
    "https://liquidelab.com/marque/kuix",
    "https://liquidelab.com/collections/kuix",
    "https://order.liquidelab.com/",
    "https://www.liquidelab.com/kuix",
  ];

  for (const u of seeds) {
    try {
      const r = await fetch(u, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
        redirect: "follow",
      });
      const t = await r.text();
      const hrefs = [...t.matchAll(/href=["']([^"']*kuix[^"']*)["']/gi)].map((m) => m[1]);
      console.log(JSON.stringify({
        u,
        status: r.status,
        final: r.url,
        kuixHrefs: [...new Set(hrefs)].slice(0, 20),
        hasKuix: /kuix/i.test(t),
      }));
    } catch (e) {
      console.log(JSON.stringify({ u, err: String(e).slice(0, 120) }));
    }
  }

  // Page gamme locale
  const home = await fetch("https://liquidelab.com/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await home.text();
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  console.log(
    "home_links",
    [...new Set(links)].filter((h) => /kuix|gamme|product|shop|boutique/i.test(h)).slice(0, 40)
  );
}

main();
