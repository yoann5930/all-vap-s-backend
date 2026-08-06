/**
 * Télécharge / détoure des fruits de référence pour les fonds packshot.
 * Usage: npx tsx scripts/build-flavor-fruit-assets.ts [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "media", "products", "_fruit-props");
const UA = "AllVapsCatalogBot/1.0 (https://allvaps.local; fruit-props; contact@allvaps.local)";

/** Fichiers Wikimedia Commons (Special:FilePath). */
const FRUIT_FILES: Record<string, string> = {
  ananas: "Pineapple_and_cross_section.jpg",
  kiwi: "Kiwi_aka.jpg",
  fraise: "PerfectStrawberry.jpg",
  framboise: "Raspberries_(Rubus_idaeus).jpg",
  myrtille: "Blueberries.jpg",
  cassis: "Blackcurrants.jpg",
  mure: "Ripe,_ripening,_and_green_blackberries.jpg",
  cerise: "Cherries_japanese.jpg",
  peche: "Autumn_Red_peaches.jpg",
  pasteque: "Watermelon_cross_BNC.jpg",
  mangue: "Mangoes_with_cross_section.jpg",
  citron: "Lemon.jpg",
  orange: "OrangeBloss_n4.jpg",
  "citron-vert": "Limes.jpg",
  banane: "Bananas.jpg",
  raisin: "Table_grapes_on_white.jpg",
  grenade: "Pomegranate_fruit_-_whole_and_open_with_seeds_-_on_white.jpg",
  passion: "Passion_fruit_cross_section.jpg",
  "fruit-du-dragon": "Pitaya_cross_section_ed2.jpg",
  pitaya: "Pitaya_cross_section_ed2.jpg",
  pomme: "Red_Apple.jpg",
  menthe: "Mentha_spicata0.jpg",
  vanille: "Vanilla.jpg",
  caramel: "Caramel-2.jpg",
  cafe: "A_small_cup_of_coffee.JPG",
  cookie: "Chocolate_chip_cookies.jpg",
  choco: "Chocolate_(blue_background).jpg",
  noisette: "Hazelnuts.jpg",
  pecan: "Carya_illinoinensis_MHNT.BOT.2007.25.12.jpg",
  custard: "Vanilla_ice_cream.jpg",
  cereales: "Cornflakes_in_a_bowl.jpg",
  popcorn: "Popcorn.jpg",
  "barbe-a-papa": "Cotton_candy.jpg",
  tabac: "Nicotiana_tabacum0.jpg",
};

function rembgBuffer(input: Buffer): Buffer | null {
  const tmpIn = path.join(OUT_DIR, `.tmp-in-${process.pid}.bin`);
  const tmpOut = path.join(OUT_DIR, `.tmp-out-${process.pid}.png`);
  try {
    fs.writeFileSync(tmpIn, input);
    const script = `
from rembg import remove
from pathlib import Path
inp = Path(r"${tmpIn.replace(/\\/g, "/")}")
out = Path(r"${tmpOut.replace(/\\/g, "/")}")
out.write_bytes(remove(inp.read_bytes()))
print("ok")
`;
    const r = spawnSync("python", ["-c", script], {
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 40 * 1024 * 1024,
    });
    if (r.status !== 0 || !fs.existsSync(tmpOut)) {
      console.warn("rembg fail", (r.stderr || r.stdout || "").slice(0, 200));
      return null;
    }
    return fs.readFileSync(tmpOut);
  } finally {
    for (const p of [tmpIn, tmpOut]) if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function downloadViaPython(fileName: string): Buffer | null {
  const fixed = `
import urllib.request, urllib.parse, sys
name = sys.argv[1]
url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name) + "?width=900"
req = urllib.request.Request(url, headers={"User-Agent": ${JSON.stringify(UA)}})
with urllib.request.urlopen(req, timeout=45) as r:
    sys.stdout.buffer.write(r.read())
`;
  const r = spawnSync("python", ["-c", fixed, fileName], {
    encoding: "buffer",
    timeout: 60000,
    maxBuffer: 30 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout || (r.stdout as Buffer).length < 1000) {
    const err = (r.stderr || Buffer.from("")).toString("utf8").slice(0, 200);
    console.warn(`dl fail ${fileName}: ${err}`);
    return null;
  }
  return r.stdout as Buffer;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const force = process.argv.includes("--force");
  const keys = Object.keys(FRUIT_FILES);
  console.log(`Building ${keys.length} fruit props → ${OUT_DIR}`);

  let ok = 0;
  let fail = 0;
  for (const key of keys) {
    const outFile = path.join(OUT_DIR, `${key}.webp`);
    if (fs.existsSync(outFile) && !force) {
      console.log(`skip ${key}`);
      ok++;
      continue;
    }
    process.stdout.write(`${key} ... `);
    try {
      const buf = downloadViaPython(FRUIT_FILES[key]);
      if (!buf) throw new Error("download empty");
      const cut = rembgBuffer(buf) || (await sharp(buf).ensureAlpha().png().toBuffer());
      await sharp(cut)
        .trim({ threshold: 10 })
        .resize(700, 700, { fit: "inside", withoutEnlargement: false })
        .webp({ quality: 90 })
        .toFile(outFile);
      console.log("ok");
      ok++;
    } catch (e) {
      console.log("fail", e instanceof Error ? e.message : e);
      fail++;
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
