/**
 * Audit complétude base matériels AVA.
 * npm run ava:devices:audit
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "ava", "devices");
const OUT = path.join(process.cwd(), "data", "ava", "device-completeness-audit.json");

type Device = {
  manufacturer?: string;
  model?: string;
  verificationStatus?: string;
  officialManualUrl?: string | null;
  images?: Record<string, string>;
  compatibleCoils?: unknown[];
  sumupProductIds?: string[];
  aliases?: string[];
};

function main() {
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json")
    : [];
  const devices = files.map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Device;
    return {
      file: f,
      manufacturer: d.manufacturer,
      model: d.model,
      verificationStatus: d.verificationStatus || "UNKNOWN",
      hasManual: Boolean(d.officialManualUrl),
      hasPhoto: Boolean(d.images && Object.keys(d.images).length),
      hasCoils: Boolean(d.compatibleCoils && d.compatibleCoils.length),
      sumupCount: d.sumupProductIds?.length || 0,
      aliasCount: d.aliases?.length || 0,
    };
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    total: devices.length,
    verified: devices.filter((d) => d.verificationStatus === "OFFICIAL_CONFIRMED").length,
    needsOfficial: devices.filter((d) => d.verificationStatus === "NEEDS_OFFICIAL_DATA").length,
    needsConfirmation: devices.filter((d) => d.verificationStatus === "NEEDS_CONFIRMATION").length,
    withoutManual: devices.filter((d) => !d.hasManual).length,
    withoutPhoto: devices.filter((d) => !d.hasPhoto).length,
    withoutCoils: devices.filter((d) => !d.hasCoils).length,
    potentialDupes: [] as string[],
    devices,
  };

  // Doublons potentiels : même modèle normalisé
  const byModel = new Map<string, string[]>();
  for (const d of devices) {
    const k = `${(d.manufacturer || "").toLowerCase()}|${(d.model || "").toLowerCase()}`;
    byModel.set(k, [...(byModel.get(k) || []), d.file]);
  }
  for (const [k, files] of byModel) {
    if (files.length > 1) summary.potentialDupes.push(`${k}: ${files.join(",")}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("→", OUT);
}

main();
