/**
 * Mission 2 — compléter uniquement les 8 covers manquantes.
 * Sources : logos fabricants officiels (fallback autorisé si cover gamme absente).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "media", "manufacturers");
const UA = "AllVapsCatalogBot/1.0 (+range covers; official manufacturer assets)";

const TARGETS: Array<{
  manufacturerSlug: string;
  rangeSlug: string;
  logoUrls: string[];
  coverUrls?: string[];
}> = [
  {
    manufacturerSlug: "swoke",
    rangeSlug: "saint-flava-swoke",
    logoUrls: ["https://swoke.net/img/logo.jpg", "https://swoke.net/img/logo.png"],
    coverUrls: [
      "https://swoke.net/img/cms/saint-flava.jpg",
      "https://swoke.net/img/c/saint-flava.jpg",
    ],
  },
  {
    manufacturerSlug: "swoke",
    rangeSlug: "bisou-swoke",
    logoUrls: ["https://swoke.net/img/logo.jpg", "https://swoke.net/img/logo.png"],
    coverUrls: [
      "https://swoke.net/img/cms/bisou.jpg",
      "https://swoke.net/img/c/bisou.jpg",
    ],
  },
  {
    manufacturerSlug: "swoke",
    rangeSlug: "force-vape-swoke",
    logoUrls: ["https://swoke.net/img/logo.jpg", "https://swoke.net/img/logo.png"],
    coverUrls: [
      "https://swoke.net/img/cms/force-vape.jpg",
      "https://swoke.net/img/c/force-vape.jpg",
    ],
  },
  {
    manufacturerSlug: "airmust",
    rangeSlug: "unik-airmust",
    logoUrls: [], // logo déjà local
  },
  {
    manufacturerSlug: "juice-66",
    rangeSlug: "66-juice-juice-66",
    logoUrls: [
      "https://www.juice66.fr/img/logo.png",
      "https://juice66.fr/img/logo.png",
      "https://www.juice66.fr/img/logo.jpg",
    ],
  },
  {
    manufacturerSlug: "aromes-secrets",
    rangeSlug: "mythologie-aromes-secrets",
    logoUrls: [
      "https://www.aromesetsecrets.com/img/logo.jpg",
      "https://aromesetsecrets.com/img/logo.jpg",
      "https://www.aromesetsecrets.com/img/logo.png",
    ],
  },
  {
    manufacturerSlug: "cloud-vapor",
    rangeSlug: "grand-taste-city-cloud-vapor",
    logoUrls: [
      "https://www.cloud-vapor.com/img/logo.jpg",
      "https://cloud-vapor.com/img/logo.jpg",
      "https://www.cloud-vapor.com/img/logo.png",
    ],
  },
  {
    manufacturerSlug: "avap",
    rangeSlug: "devil-avap",
    logoUrls: [
      "https://www.avap.fr/img/logo.png",
      "https://avap.fr/img/logo.png",
      "https://www.avap.fr/img/logo.jpg",
      "https://www.avap.fr/themes/classic/assets/img/logo.png",
    ],
  },
];

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 400 ? buf : null;
  } catch {
    return null;
  }
}

async function saveLogoWebp(input: Buffer, outFile: string) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(input)
    .ensureAlpha()
    .resize({ width: 960, height: 480, fit: "inside", withoutEnlargement: false })
    .webp({ quality: 92 })
    .toFile(outFile);
}

async function implantOnDarkCase(input: Buffer, outPath: string) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const W = 1200;
  const H = 675;
  const logo = await sharp(input)
    .ensureAlpha()
    .resize({ width: Math.floor(W * 0.72), height: Math.floor(H * 0.62), fit: "inside" })
    .png()
    .toBuffer();
  const meta = await sharp(logo).metadata();
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
    .composite([{ input: logo, left, top }])
    .webp({ quality: 90 })
    .toFile(outPath);
}

async function ensureLogo(slug: string, urls: string[]): Promise<string | null> {
  const logoPath = path.join(OUT, slug, "logo.webp");
  if (fs.existsSync(logoPath) && fs.statSync(logoPath).size > 2500) {
    return logoPath;
  }
  for (const url of urls) {
    const buf = await download(url);
    if (!buf) {
      console.log(`  logo fail ${slug} ← ${url}`);
      continue;
    }
    await saveLogoWebp(buf, logoPath);
    console.log(`  logo ok ${slug} ← ${url} (${fs.statSync(logoPath).size} bytes)`);
    return logoPath;
  }
  return fs.existsSync(logoPath) ? logoPath : null;
}

async function main() {
  const report: Array<Record<string, string>> = [];
  for (const t of TARGETS) {
    const key = `${t.manufacturerSlug}/${t.rangeSlug}`;
    const coverPath = path.join(
      OUT,
      t.manufacturerSlug,
      "ranges",
      `${t.rangeSlug}.webp`
    );
    console.log(`\n=== ${key} ===`);

    let sourceUsed = "";
    let mode: "cover" | "fallback_logo" = "fallback_logo";

    if (t.coverUrls?.length) {
      for (const url of t.coverUrls) {
        const buf = await download(url);
        if (!buf) {
          console.log(`  cover fail ← ${url}`);
          continue;
        }
        await implantOnDarkCase(buf, coverPath);
        sourceUsed = url;
        mode = "cover";
        break;
      }
    }

    if (!fs.existsSync(coverPath)) {
      const logo = await ensureLogo(t.manufacturerSlug, t.logoUrls);
      if (!logo) {
        report.push({
          key,
          status: "BLOCKED",
          reason: "logo_officiel_indisponible_dns_ou_404",
        });
        console.log(`  BLOCKED — pas de logo officiel récupérable`);
        continue;
      }
      await implantOnDarkCase(fs.readFileSync(logo), coverPath);
      sourceUsed = logo;
      mode = "fallback_logo";
    }

    const size = fs.statSync(coverPath).size;
    report.push({
      key,
      status: size >= 2500 ? "OK" : "TOO_SMALL",
      mode,
      source: sourceUsed,
      bytes: String(size),
      path: coverPath,
    });
    console.log(`  ${size >= 2500 ? "OK" : "TOO_SMALL"} ${mode} ${size} bytes`);
  }

  const outJson = path.join(ROOT, "data", "catalog", "yoann", "MISSING_COVERS_FIX_2026-08-01.json");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log("\nReport:", outJson);
  console.log(JSON.stringify(report, null, 2));

  const blocked = report.filter((r) => r.status === "BLOCKED" || r.status === "TOO_SMALL");
  process.exit(blocked.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
