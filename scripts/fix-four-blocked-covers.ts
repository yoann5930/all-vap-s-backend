/**
 * Complète les 4 covers encore bloquées (sources fabricants actuelles).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "media", "manufacturers");
const UA = "AllVapsCatalogBot/1.0 (+official manufacturer assets)";

const JOBS = [
  {
    key: "cloud-vapor/grand-taste-city-cloud-vapor",
    manufacturerSlug: "cloud-vapor",
    rangeSlug: "grand-taste-city-cloud-vapor",
    // Site officiel actuel cloudvapor.com (plus cloud-vapor.com)
    assets: [
      {
        kind: "cover",
        url: "https://aaqrzpichxfdzxgcniim.supabase.co/storage/v1/render/image/public/product-images/homepage/grandtc-1775125978311.png?width=1200&quality=90&resize=contain&format=webp",
        source: "cloudvapor.com homepage Grand Taste City (official CDN)",
      },
      {
        kind: "logo",
        url: "https://project--6c6fc377-d0a5-457b-87f3-5e1d9d1245b8.lovable.app/__l5e/assets-v1/99170d3c-5324-4d75-b062-31bbae2c4bc5/cloud-vapor-logo.webp",
        source: "cloudvapor.com official logo asset",
      },
    ],
  },
  {
    key: "aromes-secrets/mythologie-aromes-secrets",
    manufacturerSlug: "aromes-secrets",
    rangeSlug: "mythologie-aromes-secrets",
    assets: [
      {
        kind: "logo",
        url: "https://www.savourea-shop.com/img/logo.png",
        source: "savourea-shop.com (fabricant Savourea / Arômes et Secrets)",
      },
      {
        kind: "logo",
        url: "https://www.savourea-shop.com/img/logo.jpg",
        source: "savourea-shop.com logo jpg",
      },
      {
        kind: "logo",
        url: "https://www.savourea.com/img/logo.png",
        source: "savourea.com logo",
      },
    ],
  },
  {
    key: "juice-66/66-juice-juice-66",
    manufacturerSlug: "juice-66",
    rangeSlug: "66-juice-juice-66",
    assets: [
      // Archives officielles du domaine juice66.fr (site DNS mort aujourd'hui)
      {
        kind: "logo",
        url: "https://web.archive.org/web/2024/https://www.juice66.fr/img/logo.png",
        source: "web.archive juice66.fr/img/logo.png",
      },
      {
        kind: "logo",
        url: "https://web.archive.org/web/2023/https://www.juice66.fr/img/logo.jpg",
        source: "web.archive juice66.fr/img/logo.jpg",
      },
      {
        kind: "logo",
        url: "https://web.archive.org/web/2022/https://www.juice66.fr/img/logo.png",
        source: "web.archive 2022 juice66.fr logo",
      },
    ],
  },
  {
    key: "avap/devil-avap",
    manufacturerSlug: "avap",
    rangeSlug: "devil-avap",
    assets: [
      {
        kind: "logo",
        url: "https://web.archive.org/web/2024/https://www.avap.fr/img/logo.png",
        source: "web.archive avap.fr/img/logo.png",
      },
      {
        kind: "logo",
        url: "https://web.archive.org/web/2023/https://www.avap.fr/img/logo.jpg",
        source: "web.archive avap.fr/img/logo.jpg",
      },
      {
        kind: "logo",
        url: "https://www.avap.fr/img/cms/logo.png",
        source: "avap.fr cms logo",
      },
      {
        kind: "logo",
        url: "https://www.avap.fr/themes/warehouse/assets/img/logo.png",
        source: "avap.fr warehouse theme logo",
      },
    ],
  },
] as const;

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      console.log(`  HTTP ${res.status} ${url}`);
      return null;
    }
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("text/html")) {
      console.log(`  HTML not image ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) {
      console.log(`  too small ${buf.length} ${url}`);
      return null;
    }
    return buf;
  } catch (e) {
    console.log(`  ERR ${url} — ${(e as Error).message}`);
    return null;
  }
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

async function implantCover(buf: Buffer, mfr: string, range: string) {
  const out = path.join(OUT, mfr, "ranges", `${range}.webp`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const W = 1200;
  const H = 675;
  const fitted = await sharp(buf)
    .ensureAlpha()
    .resize({ width: Math.floor(W * 0.92), height: Math.floor(H * 0.88), fit: "inside" })
    .png()
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const left = Math.max(0, Math.floor((W - (meta.width || 0)) / 2));
  const top = Math.max(0, Math.floor((H - (meta.height || 0)) / 2));
  await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 8, g: 10, b: 14 } },
  })
    .composite([{ input: fitted, left, top }])
    .webp({ quality: 90 })
    .toFile(out);
  return out;
}

async function main() {
  const report: Array<Record<string, string>> = [];
  for (const job of JOBS) {
    console.log(`\n=== ${job.key} ===`);
    let done = false;
    for (const asset of job.assets) {
      const buf = await download(asset.url);
      if (!buf) continue;
      try {
        if (asset.kind === "logo") {
          const logo = await saveLogo(buf, job.manufacturerSlug);
          const cover = await implantCover(fs.readFileSync(logo), job.manufacturerSlug, job.rangeSlug);
          const bytes = String(fs.statSync(cover).size);
          report.push({
            key: job.key,
            status: Number(bytes) >= 2500 ? "OK" : "TOO_SMALL",
            mode: "fallback_logo",
            source: asset.source,
            url: asset.url,
            bytes,
          });
          console.log(`  OK logo fallback ${bytes} ← ${asset.source}`);
        } else {
          const cover = await implantCover(buf, job.manufacturerSlug, job.rangeSlug);
          const bytes = String(fs.statSync(cover).size);
          // also keep as logo if missing
          const logoPath = path.join(OUT, job.manufacturerSlug, "logo.webp");
          if (!fs.existsSync(logoPath)) await saveLogo(buf, job.manufacturerSlug);
          report.push({
            key: job.key,
            status: Number(bytes) >= 2500 ? "OK" : "TOO_SMALL",
            mode: "cover",
            source: asset.source,
            url: asset.url,
            bytes,
          });
          console.log(`  OK cover ${bytes} ← ${asset.source}`);
        }
        done = true;
        break;
      } catch (e) {
        console.log(`  convert fail: ${(e as Error).message}`);
      }
    }
    if (!done) {
      report.push({
        key: job.key,
        status: "BLOCKED",
        reason: "aucune_source_officielle_recuperable",
      });
      console.log("  BLOCKED");
    }
  }
  const out = path.join(
    process.cwd(),
    "data",
    "catalog",
    "yoann",
    "MISSING_COVERS_BLOCKED4_2026-08-01.json"
  );
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log("\n", JSON.stringify(report, null, 2));
  process.exit(report.some((r) => r.status !== "OK") ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
