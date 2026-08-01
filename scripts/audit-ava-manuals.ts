/**
 * Audit notices officielles AVA.
 * npm run ava:manuals:audit
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "ava", "devices");
const OUT = path.join(process.cwd(), "data", "ava", "manuals-audit.json");
const MD = path.join(process.cwd(), "docs", "RAPPORT_AVA_NOTICES.md");

type Dev = {
  manufacturer?: string;
  model?: string;
  verificationStatus?: string;
  officialManualUrl?: string | null;
  officialManualLocalPath?: string | null;
  officialProductUrl?: string | null;
  compatibleCoils?: unknown[];
  controls?: Record<string, unknown>;
};

function main() {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json");
  const rows = files.map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Dev;
    const localOk = d.officialManualLocalPath
      ? fs.existsSync(path.join(process.cwd(), d.officialManualLocalPath))
      : false;
    const controlsOk = Boolean(
      d.controls && (d.controls.powerOn || d.controls.powerOff)
    );
    return {
      file: f,
      manufacturer: d.manufacturer,
      model: d.model,
      verificationStatus: d.verificationStatus,
      hasManualUrl: Boolean(d.officialManualUrl),
      hasManualLocal: localOk,
      hasProductPage: Boolean(d.officialProductUrl),
      coilsCount: d.compatibleCoils?.length || 0,
      controlsFromManual: controlsOk,
      status:
        d.verificationStatus === "OFFICIAL_CONFIRMED" && localOk
          ? "OK_OFFICIAL"
          : d.officialManualUrl || localOk
            ? "PARTIAL"
            : d.compatibleCoils && d.compatibleCoils.length > 0
              ? "SPECS_ONLY"
              : "BLOCKED_NO_MANUAL",
    };
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    officialConfirmed: rows.filter((r) => r.status === "OK_OFFICIAL").length,
    partial: rows.filter((r) => r.status === "PARTIAL").length,
    specsOnly: rows.filter((r) => r.status === "SPECS_ONLY").length,
    blocked: rows.filter((r) => r.status === "BLOCKED_NO_MANUAL").length,
    rows,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

  const md = [
    `# RAPPORT AVA — Notices`,
    ``,
    `**Date :** ${summary.generatedAt}`,
    `**Commande :** \`npm run ava:manuals:audit\``,
    ``,
    `## Synthèse`,
    ``,
    `| Indicateur | Valeur |`,
    `|---|---:|`,
    `| Modèles | ${summary.total} |`,
    `| OFFICIAL + PDF local | ${summary.officialConfirmed} |`,
    `| Partiel | ${summary.partial} |`,
    `| Specs page produit seulement | ${summary.specsOnly} |`,
    `| Bloqué sans notice | ${summary.blocked} |`,
    ``,
    `## Détail`,
    ``,
    `| Fabricant | Modèle | Statut | Notice URL | PDF local | Coils |`,
    `|---|---|---|---|---|---:|`,
    ...rows.map(
      (r) =>
        `| ${r.manufacturer} | ${r.model} | ${r.status} | ${r.hasManualUrl ? "oui" : "non"} | ${r.hasManualLocal ? "oui" : "non"} | ${r.coilsCount} |`
    ),
    ``,
    `## Sources`,
    ``,
    `- Vaporesso XROS 3 : PDF officiel \`Vaporesso-XROS 3 User Manual A1-20221102\``,
    `- Voopoo Argus G2 : page produit officielle (PDF notice **non trouvé** sur voopoo.com) — specs/coils OK, procédures boutons **bloquées**`,
    `- Kuix Batterie : aucune notice officielle intégrée`,
    ``,
    `> Ne pas écrire « notices terminées » : couverture partielle uniquement.`,
    ``,
  ].join("\n");
  fs.writeFileSync(MD, md);

  console.log(JSON.stringify(summary, null, 2));
  console.log("→", OUT);
  console.log("→", MD);
  process.exit(summary.blocked === summary.total ? 2 : 0);
}

main();
