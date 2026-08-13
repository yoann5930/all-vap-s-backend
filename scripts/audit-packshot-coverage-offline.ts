/**
 * Audit offline : produits NO_IMAGE (AUDIT_PRODUITS) vs packshot-index + infer.
 * npx tsx scripts/audit-packshot-coverage-offline.ts
 */
import fs from "node:fs";
import path from "node:path";
import { inferProductPackshotUrl } from "../lib/catalog/infer-product-packshot-url";

type Issue = {
  productId: string;
  name: string;
  manufacturer: string | null;
  range: string | null;
  imageUrl: string | null;
  codes: string[];
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const MFR_ALIASES: Record<string, string> = {
  "e.tasty": "e-tasty",
  "e tasty": "e-tasty",
  liquidarom: "liquidarom",
  "cloud vapor": "cloud-vapor",
  swoke: "swoke",
};

async function main() {
  const auditPath = path.join(process.cwd(), "data/rebuild/AUDIT_PRODUITS_PUBLIES_SITE.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as {
    totals: Record<string, number>;
    issues: Issue[];
  };

  const noImage = audit.issues.filter((i) => i.codes.includes("NO_IMAGE"));
  const reconnectable: Array<{
    name: string;
    manufacturer: string | null;
    range: string | null;
    to: string;
  }> = [];
  const stillMissing: typeof reconnectable = [];
  const iceCool: Array<{ name: string; status: string; url?: string }> = [];

  for (const p of noImage) {
    const mfrName = p.manufacturer || "";
    const mfrSlug =
      MFR_ALIASES[mfrName.toLowerCase()] || slugify(mfrName);
    const rangeSlug = p.range ? slugify(p.range) : null;
    const url = inferProductPackshotUrl({
      imageUrl: null,
      productName: p.name,
      manufacturerSlug: mfrSlug || null,
      manufacturerName: mfrName || null,
      rangeSlug,
      rangeName: p.range,
    });
    const row = {
      name: p.name,
      manufacturer: p.manufacturer,
      range: p.range,
      to: url || "",
    };
    if (url) reconnectable.push(row);
    else stillMissing.push(row);

    if (/ice\s*cool/i.test(`${p.range || ""} ${p.name}`)) {
      iceCool.push({ name: p.name, status: url ? "RECONNECT" : "MISS", url: url || undefined });
    }
  }

  const out = {
    sourceAuditDate: (audit as { date?: string }).date,
    publishedTotal: audit.totals.published,
    noImageInAudit: noImage.length,
    reconnectableFromAssets: reconnectable.length,
    stillTrulyMissing: stillMissing.length,
    iceCoolNoImage: iceCool,
    reconnectableSample: reconnectable.slice(0, 80),
    stillMissingByMfr: Object.entries(
      stillMissing.reduce(
        (acc, r) => {
          const k = r.manufacturer || "?";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    ).sort((a, b) => b[1] - a[1]),
    stillMissingIceCoolRelated: stillMissing.filter(
      (r) => /ice\s*cool/i.test(`${r.range || ""} ${r.name}`),
    ),
  };

  const outPath = path.join(process.cwd(), "docs/audit-runs/packshot-reconnect-offline.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("\nWrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
