async function main() {
  const r = await fetch("https://liquidelab.com/", {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  });
  const html = await r.text();
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const interesting = [...new Set(hrefs)].filter((h) =>
    /glagla|kuix|iceberg|peche|gourmand|product|collection|marque|gamme|shop/i.test(h)
  );
  console.log("status", r.status, "len", html.length);
  console.log("interesting hrefs", interesting.slice(0, 40));
  const titles = [...html.matchAll(/>([^<]*(?:GlaGla|Kuix|Iceberg|Péché|Peche)[^<]*)</gi)].map(
    (m) => m[1].trim()
  );
  console.log("titles", [...new Set(titles)].slice(0, 30));
}
main();
