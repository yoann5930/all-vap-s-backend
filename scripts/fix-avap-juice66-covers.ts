/**
 * AVAP Devil — assets officiels liquide-avap.com
 * Juice 66 — tentatives archive / sources restantes
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "media", "manufacturers");
const UA = "AllVapsCatalogBot/1.0 (+official manufacturer assets)";

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("text/html")) throw new Error(`HTML ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`too small ${buf.length} ${url}`);
  return buf;
}

async function saveLogo(buf: Buffer, slug: string) {
  const out = path.join(OUT, slug, "logo.webp");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(buf)
    .ensureAlpha()
    .resize({ width: 960, height: 480, fit: "inside" })
    .webp({ quality: 92 })
    .toFile(out);
  return out;
}

async function implant(buf: Buffer, mfr: string, range: string) {
  const out = path.join(OUT, mfr, "ranges", `${range}.webp`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const W = 1200;
  const H = 675;
  const fitted = await sharp(buf)
    .ensureAlpha()
    .resize({
      width: Math.floor(W * 0.92),
      height: Math.floor(H * 0.88),
      fit: "inside",
    })
    .png()
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const left = Math.max(0, Math.floor((W - (meta.width || 0)) / 2));
  const top = Math.max(0, Math.floor((H - (meta.height || 0)) / 2));
  await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 8, g: 10, b: 14 },
    },
  })
    .composite([{ input: fitted, left, top }])
    .webp({ quality: 90 })
    .toFile(out);
  return out;
}

async function fixAvap() {
  console.log("=== avap/devil-avap ===");
  const logoUrl =
    "https://liquide-avap.com/img/avap-liquide-logo-1762163572.jpg";
  const coverCandidates = [
    "https://www.liquide-avap.com/img/cms/Banniere/Banniere%20pub/Createur%20du%20red%20devil.png",
    "https://liquide-avap.com/3119-large_default/pack-eliquide-devil-fresh.jpg",
    "https://liquide-avap.com/c/fr-default-large_default/red-devil.jpg",
    logoUrl,
  ];
  const logo = await download(logoUrl);
  await saveLogo(logo, "avap");
  console.log("logo OK", logoUrl);

  for (const url of coverCandidates) {
    try {
      const buf = await download(url);
      const cover = await implant(buf, "avap", "devil-avap");
      console.log("cover OK", fs.statSync(cover).size, url);
      return { key: "avap/devil-avap", status: "OK", source: url };
    } catch (e) {
      console.log("cover fail", (e as Error).message);
    }
  }
  return { key: "avap/devil-avap", status: "BLOCKED" };
}

async function fixJuice66() {
  console.log("=== juice-66/66-juice-juice-66 ===");
  // CDX + domaines connus
  const candidates = [
    // Wayback wildcards resolved timestamps often need exact stamp — try common patterns
    "https://web.archive.org/web/20200101000000id_/https://www.juice66.fr/img/logo.png",
    "https://web.archive.org/web/20210101000000id_/https://www.juice66.fr/img/logo.png",
    "https://web.archive.org/web/20220101000000id_/https://www.juice66.fr/img/logo.png",
    "https://web.archive.org/web/20230101000000id_/https://www.juice66.fr/img/logo.png",
    "https://web.archive.org/web/20200101000000id_/http://www.juice66.fr/img/logo.jpg",
    "https://web.archive.org/web/2019/http://www.juice66.fr/img/logo.jpg",
  ];

  // Try CDX API for exact timestamps
  try {
    const cdxUrl =
      "https://web.archive.org/cdx/search/cdx?url=juice66.fr/img/logo*&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&limit=20";
    const res = await fetch(cdxUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) {
      const json = (await res.json()) as string[][];
      for (const row of json.slice(1)) {
        const [ts, original] = row;
        candidates.unshift(
          `https://web.archive.org/web/${ts}id_/${original}`
        );
      }
      console.log("CDX hits", json.length - 1);
    }
  } catch (e) {
    console.log("CDX fail", (e as Error).message);
  }

  for (const url of candidates) {
    try {
      const buf = await download(url);
      await saveLogo(buf, "juice-66");
      const cover = await implant(buf, "juice-66", "66-juice-juice-66");
      console.log("OK", fs.statSync(cover).size, url);
      return { key: "juice-66/66-juice-juice-66", status: "OK", source: url };
    } catch (e) {
      console.log("fail", (e as Error).message.slice(0, 120));
    }
  }
  return {
    key: "juice-66/66-juice-juice-66",
    status: "BLOCKED",
    reason: "site_officiel_DNS_mort_et_archive_logo_introuvable",
  };
}

async function main() {
  const report = [await fixAvap(), await fixJuice66()];
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.some((r) => r.status !== "OK") ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
