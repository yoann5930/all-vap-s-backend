/**
 * Batch CLI — normalise le catalogue au style e-tasty (lib partagée).
 * Usage: npx tsx scripts/normalize-product-photos.ts --force
 */
import fs from "node:fs";
import path from "node:path";
import {
  PRODUCT_MEDIA_ROOT,
  normalizeProductImageToEtastyStyle,
} from "../lib/catalog/normalize-product-image";

const BACKUP_ROOT = path.join(PRODUCT_MEDIA_ROOT, "_backup_pre_normalize");
const PREVIEW_DIR = path.join(process.cwd(), "data", "phototheque", "normalize-preview");

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: Number(get("--limit") || 0) || 0,
    dir: path.resolve(process.cwd(), get("--dir") || PRODUCT_MEDIA_ROOT),
    preview: argv.includes("--preview"),
  };
}

function listImages(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_backup") || entry.name === "_raw" || entry.name === "_fruit-props")
          continue;
        walk(full);
        continue;
      }
      if (!/\.(webp|jpe?g|png)$/i.test(entry.name)) continue;
      if (/-thumb\./i.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function backupPathFor(src: string): string {
  return path.join(BACKUP_ROOT, path.relative(PRODUCT_MEDIA_ROOT, src));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = listImages(args.dir);
  console.log(`Images: ${files.length}`);
  console.log(`Style: e-tasty obligatoire`);
  console.log(`mode: ${args.dryRun ? "dry-run" : args.preview ? "preview" : "write"}`);

  let ok = 0;
  let err = 0;
  let done = 0;

  for (const file of files) {
    if (args.limit && done >= args.limit) break;
    done++;
    const displayRel = path.relative(PRODUCT_MEDIA_ROOT, file);
    if (args.dryRun) {
      console.log(`[dry] ${displayRel}`);
      continue;
    }

    const outPath = args.preview
      ? path.join(PREVIEW_DIR, displayRel.replace(/\.(jpe?g|png)$/i, ".webp"))
      : file.replace(/\.(jpe?g|png)$/i, ".webp");

    process.stdout.write(`[${done}/${args.limit || files.length}] ${displayRel} ... `);
    try {
      const backup = backupPathFor(file);
      if (!fs.existsSync(backup) && !args.preview) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(file, backup);
      }
      const source = fs.existsSync(backup) ? backup : file;
      const keepNativeFruits = /e-tasty|etasty/i.test(displayRel);
      await normalizeProductImageToEtastyStyle({
        inputBuffer: fs.readFileSync(source),
        outPath,
        flavorHint: displayRel,
        keepNativeFruits,
      });
      if (!args.preview && path.resolve(outPath) !== path.resolve(file) && fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      console.log("ok");
      ok++;
    } catch (e) {
      console.log("error", e instanceof Error ? e.message : e);
      err++;
    }
  }

  console.log(`\nDone. ok=${ok} err=${err}`);
  if (err > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
