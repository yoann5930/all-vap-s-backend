/**
 * Audit produits publiés vs packshots (dry-run).
 * npx tsx scripts/audit-reconnect-product-photos.ts
 * npx tsx scripts/audit-reconnect-product-photos.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { inferProductPackshotUrl } from "../lib/catalog/infer-product-packshot-url";

const APPLY = process.argv.includes("--apply");
const PUBLIC = path.join(process.cwd(), "public");

function fileExists(url: string | null | undefined) {
  if (!url) return false;
  const abs = path.join(PUBLIC, url.replace(/^\//, ""));
  return fs.existsSync(abs);
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: true,
      catalogStatus: { in: ["valide", "actif"] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      imageStatus: true,
      brand: true,
      range: true,
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const analyzed = products.length;
  let withWorkingImage = 0;
  let reconnectable = 0;
  let alreadyOk = 0;
  let trulyMissing = 0;
  let brokenUrl = 0;
  const reconnect: Array<{
    id: string;
    name: string;
    mfr: string | null;
    range: string | null;
    from: string | null;
    to: string;
  }> = [];
  const missing: Array<{
    name: string;
    slug: string;
    mfr: string | null;
    range: string | null;
    imageUrl: string | null;
  }> = [];
  const iceCoolFocus: typeof reconnect = [];

  for (const p of products) {
    const mfrSlug = p.manufacturer?.slug ?? null;
    const rangeSlug = p.rangeRef?.slug ?? null;
    const currentOk =
      Boolean(p.imageUrl) &&
      (p.imageUrl!.startsWith("/media/products/") || fileExists(p.imageUrl));

    const inferred = inferProductPackshotUrl({
      imageUrl: null, // force re-match from assets
      productName: p.name,
      manufacturerSlug: mfrSlug,
      manufacturerName: p.manufacturer?.name,
      rangeSlug,
      rangeName: p.rangeRef?.name ?? p.range,
    });

    if (currentOk && (!inferred || inferred === p.imageUrl)) {
      alreadyOk++;
      withWorkingImage++;
      continue;
    }

    if (p.imageUrl && !currentOk) brokenUrl++;

    if (inferred && inferred !== p.imageUrl) {
      reconnectable++;
      const row = {
        id: p.id,
        name: p.name,
        mfr: mfrSlug,
        range: rangeSlug,
        from: p.imageUrl,
        to: inferred,
      };
      reconnect.push(row);
      if (rangeSlug === "ice-cool" || rangeSlug === "ice-cool-x" || /ice\s*cool/i.test(p.name)) {
        iceCoolFocus.push(row);
      }
      continue;
    }

    if (!currentOk && !inferred) {
      trulyMissing++;
      missing.push({
        name: p.name,
        slug: p.slug,
        mfr: mfrSlug,
        range: rangeSlug,
        imageUrl: p.imageUrl,
      });
    } else if (currentOk) {
      alreadyOk++;
      withWorkingImage++;
    }
  }

  if (APPLY && reconnect.length) {
    let updated = 0;
    for (const r of reconnect) {
      await prisma.product.update({
        where: { id: r.id },
        data: {
          imageUrl: r.to,
          imageStatus: "official",
        },
      });
      updated++;
    }
    console.log(JSON.stringify({ applied: updated }, null, 2));
  }

  const out = {
    analyzed,
    alreadyOk,
    reconnectable,
    trulyMissing,
    brokenUrl,
    iceCoolReconnectable: iceCoolFocus,
    iceCoolMissing: missing.filter(
      (m) => m.range === "ice-cool" || m.range === "ice-cool-x" || /ice\s*cool/i.test(m.name)
    ),
    reconnectSample: reconnect.slice(0, 40),
    missingSample: missing.slice(0, 40),
  };
  console.log(JSON.stringify(out, null, 2));
  fs.mkdirSync(path.join("rapports"), { recursive: true });
  fs.writeFileSync(
    path.join("rapports", "audit-reconnect-product-photos.json"),
    JSON.stringify({ ...out, reconnect, missing }, null, 2)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
