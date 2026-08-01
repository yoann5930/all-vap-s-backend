import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data/ava/devices");
const devices = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => ({
    ...JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")),
    file: f,
  }));

const out = { generatedAt: new Date().toISOString(), devices };
fs.writeFileSync(path.join(DIR, "index.json"), JSON.stringify(out, null, 2));
console.log(
  `index: ${devices.length} devices →`,
  devices.map((d) => `${d.model} (${d.verificationStatus})`).join(", "),
);
