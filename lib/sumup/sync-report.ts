/**
 * Rapports de synchronisation SumUp (fichiers JSON + résumé Markdown).
 */
import fs from "node:fs";
import path from "node:path";

export type SyncReportInput = {
  ok: boolean;
  dryRun: boolean;
  skipped: boolean;
  syncRunId: string | null;
  transactionsFetched: number;
  transactionsProcessed: number;
  transactionsSkipped: number;
  duplicates: number;
  salesApplied: number;
  refundsApplied: number;
  unrecognizedLines: number;
  errors: string[];
  catalogExport?: { magasin: string; ava: string };
  message: string;
};

export function getRapportsDir(): string {
  return path.resolve(process.cwd(), "rapports");
}

export function writeSumUpSyncReport(result: SyncReportInput): {
  jsonPath: string;
  mdPath: string;
} {
  const dir = getRapportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `sumup-sync-${stamp}`;
  const jsonPath = path.join(dir, `${base}.json`);
  const mdPath = path.join(dir, `${base}.md`);

  const payload = {
    generatedAt: new Date().toISOString(),
    ...result,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const md = [
    `# Rapport sync SumUp — ${payload.generatedAt}`,
    "",
    `- **ok** : ${result.ok}`,
    `- **dryRun** : ${result.dryRun}`,
    `- **skipped** : ${result.skipped}`,
    `- **syncRunId** : ${result.syncRunId || "—"}`,
    `- **message** : ${result.message}`,
    "",
    "## Compteurs",
    "",
    `| Métrique | Valeur |`,
    `|----------|--------|`,
    `| Transactions récupérées | ${result.transactionsFetched} |`,
    `| Traitées | ${result.transactionsProcessed} |`,
    `| Ignorées | ${result.transactionsSkipped} |`,
    `| Doublons | ${result.duplicates} |`,
    `| Ventes appliquées | ${result.salesApplied} |`,
    `| Remboursements | ${result.refundsApplied} |`,
    `| Lignes non reconnues | ${result.unrecognizedLines} |`,
    `| Erreurs | ${result.errors.length} |`,
    "",
    result.catalogExport
      ? `## Catalogues exportés\n\n- Magasin : \`${result.catalogExport.magasin}\`\n- A.V.A. : \`${result.catalogExport.ava}\`\n`
      : "## Catalogues exportés\n\nAucun (dry-run ou sync sans export).\n",
    result.errors.length
      ? `## Erreurs\n\n${result.errors.map((e) => `- ${e}`).join("\n")}\n`
      : "",
  ].join("\n");

  fs.writeFileSync(mdPath, md, "utf8");
  fs.writeFileSync(path.join(dir, "sumup-sync-latest.json"), JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "sumup-sync-latest.md"), md, "utf8");

  return { jsonPath, mdPath };
}
