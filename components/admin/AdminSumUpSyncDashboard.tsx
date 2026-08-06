"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, History, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Light = "ok" | "warn" | "error";

type Dashboard = {
  generatedAt: string;
  lights: Array<{ key: string; label: string; light: Light; detail: string }>;
  stats: {
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncFileName: string | null;
    referencesInStock: number;
    unitsAvailable: number;
    outOfStock: number;
    lowStock: number;
    errorCountLastRun: number;
    duplicateCountLastRun: number;
    unmatchedCountLastRun: number;
    createCountLastRun: number;
    updatedCountLastRun: number;
    unchangedCountLastRun: number;
    inboxFilesPending: number;
    inboxFilesProcessed: number;
  };
  recentRuns: Array<{
    id: string;
    source: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    fileName: string | null;
    importedCount: number;
    updatedCount: number;
    unchangedCount: number;
    createCount: number;
    duplicateCount: number;
    unmatchedCount: number;
    errorCount: number;
  }>;
};

function LightDot({ light }: { light: Light }) {
  const color =
    light === "ok" ? "bg-emerald-400" : light === "warn" ? "bg-amber-400" : "bg-rose-500";
  const label = light === "ok" ? "OK" : light === "warn" ? "Attention" : "Erreur";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[#A7B0BC]">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}

export function AdminSumUpSyncDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sumup-sync/status");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function forceSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/stocks/sync", { method: "POST" });
      const json = await res.json();
      setMessage(json.message || (json.ok ? "Synchronisation terminée" : "Échec"));
      await load();
    } catch {
      setMessage("Erreur de synchronisation");
    }
    setSyncing(false);
  }

  if (loading && !data) {
    return <p className="mt-6 text-sm text-[#A7B0BC]">Chargement du tableau de bord…</p>;
  }

  if (!data) {
    return <p className="mt-6 text-sm text-rose-400">Impossible de charger le statut SumUp.</p>;
  }

  const s = data.stats;

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={forceSync} loading={syncing} size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Connecter stock SumUp
        </Button>
        <Link
          href="/admin/sumup-sync/historique"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#A7B0BC] hover:border-brand-400/40 hover:text-white"
        >
          <History className="h-4 w-4" />
          Historique
        </Link>
        <Link
          href="/admin/stocks"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#A7B0BC] hover:border-brand-400/40 hover:text-white"
        >
          <Warehouse className="h-4 w-4" />
          Stocks
        </Link>
        {message ? <p className="text-sm text-[#A7B0BC]">{message}</p> : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.lights.map((l) => (
          <div
            key={l.key}
            className="rounded-2xl border border-white/8 bg-[#101720]/80 px-4 py-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">{l.label}</p>
              <LightDot light={l.light} />
            </div>
            <p className="mt-2 text-xs text-[#A7B0BC]">{l.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Références en stock", s.referencesInStock],
          ["Unités disponibles", s.unitsAvailable],
          ["Ruptures", s.outOfStock],
          ["Stock faible", s.lowStock],
          ["Modifiés (dernier run)", s.updatedCountLastRun],
          ["Inchangés", s.unchangedCountLastRun],
          ["Nouveaux", s.createCountLastRun],
          ["Doublons", s.duplicateCountLastRun],
          ["Inconnus", s.unmatchedCountLastRun],
          ["Erreurs", s.errorCountLastRun],
          ["CSV inbox", s.inboxFilesPending],
          ["CSV déjà traités", s.inboxFilesProcessed],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-white/8 bg-[#0B1016] px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-wider text-white/45">{label}</p>
            <p className="mt-1 font-display text-2xl text-white">{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-display text-lg text-white">Dernières synchronisations</h2>
        <p className="mt-1 text-sm text-[#A7B0BC]">
          Dernier fichier : {s.lastSyncFileName || "—"} · Statut : {s.lastSyncStatus || "—"}
          {s.lastSyncAt
            ? ` · ${new Date(s.lastSyncAt).toLocaleString("fr-FR")}`
            : ""}
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/8">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#101720] text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Fichier</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Maj</th>
                <th className="px-3 py-2">Inchangés</th>
                <th className="px-3 py-2">Nouveaux</th>
                <th className="px-3 py-2">Doublons</th>
                <th className="px-3 py-2">Inconnus</th>
                <th className="px-3 py-2">Erreurs</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.map((r) => (
                <tr key={r.id} className="border-t border-white/5 text-[#A7B0BC]">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.startedAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-2">{r.source}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate" title={r.fileName || ""}>
                    {r.fileName || "—"}
                  </td>
                  <td className="px-3 py-2 text-white">{r.status}</td>
                  <td className="px-3 py-2">{r.updatedCount}</td>
                  <td className="px-3 py-2">{r.unchangedCount}</td>
                  <td className="px-3 py-2">{r.createCount}</td>
                  <td className="px-3 py-2">{r.duplicateCount}</td>
                  <td className="px-3 py-2">{r.unmatchedCount}</td>
                  <td className="px-3 py-2">{r.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
