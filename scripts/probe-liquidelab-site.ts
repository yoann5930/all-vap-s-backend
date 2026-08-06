async function main() {
  const urls = [
    "https://liquidelab.com/",
    "https://liquidelab.com/collections/glagla",
    "https://liquidelab.com/collections/iceberg",
    "https://liquidelab.com/collections/kuix",
    "https://liquidelab.com/collections/peche-gourmands",
    "https://liquidelab.com/products.json?limit=5",
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { Accept: "text/html,application/json", "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      const t = await r.text();
      console.log(JSON.stringify({ u, status: r.status, final: r.url, body: t.slice(0, 160).replace(/\s+/g, " ") }));
    } catch (e) {
      console.log(JSON.stringify({ u, err: String(e).slice(0, 120) }));
    }
  }
}
main();
