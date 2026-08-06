"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HistoryPayload = {
  runs: Array<{
    id: string;
    source: string;
    status: string;
    dryRun: boolean;
    startedAt: string;
    completedAt: string | null;
    fileName: string | null;
    fileHash: string | null;
    importedCount: number;
    updatedCount: number;
    unchangedCount: number;
    createCount: number;
    duplicateCount: number;
    unmatchedCount: number;
    errorCount: number;
    errorSummary: string | null;
  }>;
  inboxFiles: Array<{
    id: string;
    fileName: string;
    fileHash: string;
    status: string;
    processedAt: string;
    syncRunId: string | null;
  }>;
};

export function AdminSumUpSyncHistoryClient() {
  const [data, setData] = useState<HistoryPayload | null>(null);

  useEffect(() => {
    fetch("/api/admin/sumup-sync/history?limit=80")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return <p className="mt-6 text-sm text-[#A7B0BC]">Chargement de l’historique…</p>;
  }

  return (
    <div className="mt-6 space-y-10">
      <p className="text-sm text-[#A7B0BC]">
        <Link href="/admin/sumup-sync" className="text-brand-400 hover:underline">
          ← Tableau de bord sync
        </Link>
      </p>

      <section>
        <h2 className="font-display text-lg text-white">Runs de synchronisation</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/8">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#101720] text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2">Date / heure</th>
                <th className="px-3 py-2">Fichier</th>
                <th className="px-3 py-2">Produits</th>
                <th className="px-3 py-2">Modifiés</th>
                <th className="px-3 py-2">Inchangés</th>
                <th className="px-3 py-2">Nouveaux</th>
                <th className="px-3 py-2">Doublons</th>
                <th className="px-3 py-2">Erreurs</th>
                <th className="px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} className="border-t border-white/5 text-[#A7B0BC]">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.startedAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-[220px] truncate text-white" title={r.fileName || ""}>
                      {r.fileName || "—"}
                    </div>
                    {r.fileHash ? (
                      <div className="font-mono text-[10px] text-white/35">
                        {r.fileHash.slice(0, 16)}…
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.importedCount}</td>
                  <td className="px-3 py-2">{r.updatedCount}</td>
                  <td className="px-3 py-2">{r.unchangedCount}</td>
                  <td className="px-3 py-2">{r.createCount}</td>
                  <td className="px-3 py-2">{r.duplicateCount}</td>
                  <td className="px-3 py-2">{r.errorCount}</td>
                  <td className="px-3 py-2 text-white">
                    {r.status}
                    {r.dryRun ? " (dry)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg text-white">Fichiers inbox traités (hash)</h2>
        <p className="mt-1 text-sm text-[#A7B0BC]">
          Un même contenu CSV n’est jamais réimporté deux fois.
        </p>
        <ul className="mt-4 space-y-2">
          {data.inboxFiles.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-white/8 bg-[#101720]/60 px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-white">{f.fileName}</span>
                <span className="text-xs uppercase tracking-wider text-[#A7B0BC]">{f.status}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-white/40">{f.fileHash}</p>
              <p className="mt-1 text-xs text-[#A7B0BC]">
                {new Date(f.processedAt).toLocaleString("fr-FR")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
