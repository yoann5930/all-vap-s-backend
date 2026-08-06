import "./load-env";
import { getSumUpSyncConfig } from "../lib/sumup/config";

const cfg = getSumUpSyncConfig();
const mc = encodeURIComponent(cfg.merchantCode);

type Probe = { base: string; method: string; path: string; body?: unknown };

const probes: Probe[] = [
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/merchants/${mc}/items` },
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/merchants/${mc}/catalog/items` },
  { base: "https://api.sumup.com", method: "GET", path: `/v1/merchants/${mc}/items` },
  { base: "https://api.sumup.com", method: "GET", path: `/v2.1/merchants/${mc}/items` },
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/merchants/${mc}/inventory` },
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/merchants/${mc}/products` },
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/me/merchant-profile` },
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/me/items` },
  { base: "https://api.sumup.com", method: "GET", path: `/v0.1/catalog/items` },
  {
    base: "https://api.sumup.com",
    method: "POST",
    path: `/v0.1/merchants/${mc}/catalog/items/search`,
    body: { query: "", limit: 5 },
  },
  {
    base: "https://me.sumup.com",
    method: "POST",
    path: `/api/proxy/merchants/${mc}/catalog/items/search`,
    body: { query: "", limit: 5 },
  },
  {
    base: "https://me.sumup.com",
    method: "GET",
    path: `/api/proxy/merchants/${mc}/catalog/items?limit=5`,
  },
];

async function main() {
  for (const p of probes) {
    const url = `${p.base}${p.path}`;
    try {
      const res = await fetch(url, {
        method: p.method,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: p.body ? JSON.stringify(p.body) : undefined,
      });
      const text = await res.text();
      console.log(
        JSON.stringify({
          method: p.method,
          url: url.replace(cfg.merchantCode, "MC***"),
          status: res.status,
          body: text.slice(0, 220).replace(/\s+/g, " "),
        })
      );
    } catch (e) {
      console.log(
        JSON.stringify({
          method: p.method,
          url: url.replace(cfg.merchantCode, "MC***"),
          status: "ERR",
          body: String(e).slice(0, 160),
        })
      );
    }
  }
}

main();
