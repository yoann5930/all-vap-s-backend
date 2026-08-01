/**
 * Import matériels SumUp/Prisma → data/ava/devices/
 * NEEDS_OFFICIAL_DATA uniquement — pas OFFICIAL_CONFIRMED.
 *
 * npm run ava:devices:import
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const ROOT = process.cwd();
const DEVICES_DIR = path.join(ROOT, "data", "ava", "devices");
const ALIASES_PATH = path.join(ROOT, "data", "ava", "device-aliases.json");
const REPORT_PATH = path.join(ROOT, "data", "ava", "device-import-report.json");

const ELIQUIDE_RE =
  /\b(e-?liquide|eliquide|booster|concentre|arome|nicotine|sel de nicotine|shortfill|diy)\b/i;
const COIL_ONLY_RE =
  /\b(resistance|coil|mesh coil|coil mesh)\b/i;
const HARDWARE_RE =
  /\b(pod|kit|box|mod|clearomiseur|atomiseur|cartouche|battery|batterie|chargeur|xros|argus|aegis|geekvape|vaporesso|voopoo|oxva|uwell|smok|innokin|aspire|lost vape|dotmod)\b/i;

type Category =
  | "pod"
  | "kit"
  | "box"
  | "mod"
  | "clearomiseur"
  | "atomiseur"
  | "cartouche"
  | "batterie intégrée"
  | "chargeur spécifique"
  | "accessoire technique lié à un modèle"
  | "unknown";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function classify(name: string, category: string, productType: string | null): Category | null {
  const blob = `${name} ${category} ${productType || ""}`;
  if (ELIQUIDE_RE.test(blob) && !HARDWARE_RE.test(blob)) return null;
  if (COIL_ONLY_RE.test(blob) && !/\b(kit|pod|box|mod)\b/i.test(blob)) return null;
  if (/\bcartouche\b/i.test(blob)) return "cartouche";
  if (/\bclearomiseur\b/i.test(blob)) return "clearomiseur";
  if (/\batomiseur\b/i.test(blob)) return "atomiseur";
  if (/\bchargeur\b/i.test(blob)) return "chargeur spécifique";
  // Pods jetables nicotinés (ex. Kuix 10mg/20mg) ≠ cigarette électronique rechargeable
  if (/\b\d+\s*mg\b/i.test(blob) && /\b(pod|puff|kuix)\b/i.test(blob)) return null;
  if (/\bbatterie\b/i.test(blob) && /materiel|matériel/i.test(category)) {
    return "batterie intégrée";
  }
  if (/\b(kit)\b/i.test(blob)) return "kit";
  if (/\b(box|mod)\b/i.test(blob)) return /\bmod\b/i.test(blob) ? "mod" : "box";
  if (
    (/\bpod\b/i.test(blob) || /\bxros|argus|xlim|caliburn|nord\b/i.test(blob)) &&
    !/\b\d+\s*mg\b/i.test(blob)
  ) {
    return "pod";
  }
  if (HARDWARE_RE.test(blob)) return "accessoire technique lié à un modèle";
  // Catégories Prisma typiques
  if (/materiel|matériel|cigarette|device|hardware/i.test(category)) {
    return "accessoire technique lié à un modèle";
  }
  return null;
}

function parseManufacturerModel(name: string): { manufacturer: string; model: string } {
  // Variantes couleur Kuix batterie → un seul modèle
  if (/kuix\s+batterie/i.test(name)) {
    return { manufacturer: "Liquide Lab", model: "Kuix Batterie" };
  }
  const known = [
    "Vaporesso",
    "Voopoo",
    "Oxva",
    "Uwell",
    "Geekvape",
    "Smok",
    "Innokin",
    "Aspire",
    "Lost Vape",
    "Dotmod",
    "Joyetech",
    "Eleaf",
    "Freemax",
  ];
  for (const brand of known) {
    const re = new RegExp(`^${brand}\\s+(.+)$`, "i");
    const m = name.match(re);
    if (m) return { manufacturer: brand, model: m[1].replace(/\s+/g, " ").trim() };
  }
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return { manufacturer: parts[0], model: parts.slice(1).join(" ") };
  }
  return { manufacturer: "Unknown", model: name };
}

function deviceKey(manufacturer: string, model: string) {
  return `${slugify(manufacturer)}-${slugify(model)}`;
}

async function main() {
  fs.mkdirSync(DEVICES_DIR, { recursive: true });

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { category: { contains: "materiel", mode: "insensitive" } },
        { category: { contains: "matériel", mode: "insensitive" } },
        { category: { contains: "cigarette", mode: "insensitive" } },
        { category: { contains: "pod", mode: "insensitive" } },
        { category: { contains: "kit", mode: "insensitive" } },
        { name: { contains: "xros", mode: "insensitive" } },
        { name: { contains: "argus", mode: "insensitive" } },
        { name: { contains: "pod", mode: "insensitive" } },
        { name: { contains: "kit ", mode: "insensitive" } },
        { productType: { contains: "device", mode: "insensitive" } },
        { productType: { contains: "materiel", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      barcode: true,
      sumupProductId: true,
      category: true,
      productType: true,
      imageUrl: true,
      isActive: true,
      manufacturer: { select: { name: true, slug: true } },
    },
    take: 2000,
  });

  const aliases: Record<string, string[]> = fs.existsSync(ALIASES_PATH)
    ? JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"))
    : {};

  const byDevice = new Map<
    string,
    {
      manufacturer: string;
      model: string;
      category: Category;
      sumupProductIds: string[];
      barcodes: string[];
      aliases: Set<string>;
      imageUrl: string | null;
      sourceProducts: string[];
    }
  >();

  let skippedEliquide = 0;
  let skippedUnclassified = 0;

  for (const p of products) {
    const cat = classify(p.name, p.category || "", p.productType);
    if (!cat) {
      if (ELIQUIDE_RE.test(p.name) || ELIQUIDE_RE.test(p.category || "")) skippedEliquide++;
      else skippedUnclassified++;
      continue;
    }

    let parsed = p.manufacturer?.name
      ? {
          manufacturer: p.manufacturer.name,
          model:
            p.name
              .replace(new RegExp(`^${p.manufacturer.name}\\s*`, "i"), "")
              .trim() || p.name,
        }
      : parseManufacturerModel(p.name);

    if (/kuix\s+batterie/i.test(p.name)) {
      parsed = { manufacturer: "Liquide Lab", model: "Kuix Batterie" };
    }

    const key = deviceKey(parsed.manufacturer, parsed.model);
    const existing = byDevice.get(key);
    if (existing) {
      if (p.sumupProductId && !existing.sumupProductIds.includes(p.sumupProductId)) {
        existing.sumupProductIds.push(p.sumupProductId);
      }
      if (p.barcode) existing.barcodes.push(p.barcode);
      existing.aliases.add(slugify(p.name));
      existing.sourceProducts.push(p.slug);
      continue;
    }

    byDevice.set(key, {
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      category: cat,
      sumupProductIds: p.sumupProductId ? [p.sumupProductId] : [],
      barcodes: p.barcode ? [p.barcode] : [],
      aliases: new Set([slugify(p.name), slugify(parsed.model)]),
      imageUrl: p.imageUrl,
      sourceProducts: [p.slug],
    });
  }

  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const [key, d] of byDevice) {
    const file = path.join(DEVICES_DIR, `${key}.json`);
    const payload = {
      manufacturer: d.manufacturer,
      model: d.model,
      aliases: [...d.aliases],
      category: d.category,
      sumupProductIds: d.sumupProductIds,
      barcode: d.barcodes[0] || null,
      verificationStatus: "NEEDS_OFFICIAL_DATA",
      source: "SUMUP",
      officialManualUrl: null,
      images: d.imageUrl ? { front: d.imageUrl } : {},
      importedAt: new Date().toISOString(),
      sourceProducts: d.sourceProducts,
    };

    if (fs.existsSync(file)) {
      const prev = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      const prevStatus = String(prev.verificationStatus || "");
      const mergedIds = [
        ...new Set([
          ...((prev.sumupProductIds as string[]) || []),
          ...d.sumupProductIds,
        ]),
      ];
      const mergedAliases = [
        ...new Set([
          ...((prev.aliases as string[]) || []),
          ...d.aliases,
        ]),
      ];
      // Préserver notices / confirmation existantes
      if (
        prevStatus === "OFFICIAL_CONFIRMED" ||
        prevStatus === "NEEDS_CONFIRMATION"
      ) {
        fs.writeFileSync(
          file,
          JSON.stringify(
            {
              ...prev,
              sumupProductIds: mergedIds,
              aliases: mergedAliases,
            },
            null,
            2
          )
        );
        updated.push(key);
      } else {
        fs.writeFileSync(
          file,
          JSON.stringify(
            {
              ...payload,
              ...prev,
              sumupProductIds: mergedIds,
              aliases: mergedAliases,
              verificationStatus: prevStatus || "NEEDS_OFFICIAL_DATA",
            },
            null,
            2
          )
        );
        unchanged.push(key);
      }
    } else {
      fs.writeFileSync(file, JSON.stringify(payload, null, 2));
      created.push(key);
    }

    aliases[key] = [...d.aliases];
  }

  fs.writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2));

  // Index client-safe (tous les JSON devices/)
  const indexDevices = fs
    .readdirSync(DEVICES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(DEVICES_DIR, f), "utf8")
      ) as Record<string, unknown>;
      return { ...raw, file: f };
    });
  fs.writeFileSync(
    path.join(DEVICES_DIR, "index.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), devices: indexDevices },
      null,
      2
    )
  );

  const report = {
    generatedAt: new Date().toISOString(),
    scannedProducts: products.length,
    devices: byDevice.size,
    created: created.length,
    updated: updated.length,
    unchanged: unchanged.length,
    skippedEliquide,
    skippedUnclassified,
    createdKeys: created,
    updatedKeys: updated,
    note: "verificationStatus=NEEDS_OFFICIAL_DATA — notices non inventées",
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
