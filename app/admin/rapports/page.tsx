"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ReportRow = {
  id: string;
  type: string;
  title: string;
  periodStart: string;
  emailStatus: string;
  hasRealPurchase: boolean;
  isTest: boolean;
  pdfPath: string | null;
  createdAt: string;
  emailLastError: string | null;
};

export default function AdminRapportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const q = type ? `?type=${encodeURIComponent(type)}` : "";
    const res = await fetch(`/api/admin/reports${q}`);
    if (!res.ok) {
      setError("Accès refusé");
      return;
    }
    const data = await res.json();
    setReports(data.reports || []);
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(periodKey: string, sendEmail: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          type: "on_demand",
          periodKey,
          sendEmail,
          force: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await load();
      if (data.reportId) {
        const detail = await fetch(`/api/admin/reports?id=${data.reportId}`);
        setSelected(await detail.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function openReport(id: string) {
    const res = await fetch(`/api/admin/reports?id=${id}`);
    if (res.ok) setSelected(await res.json());
  }

  return (
    <div className="admin-page">
      <header className="mb-6">
        <p className="admin-eyebrow">Exploitation</p>
        <h1 className="admin-h1">Rapports de gestion</h1>
        <p className="admin-muted mt-1">
          Historique conservé — pas de suppression automatique. PDF et e-mail uniquement sur données réelles.
        </p>
      </header>

      <div className="admin-card flex flex-wrap gap-2 mb-4">
        <select className="admin-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous types</option>
          <option value="daily">Quotidien</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="monthly">Mensuel</option>
          <option value="on_demand">À la demande</option>
        </select>
        <button type="button" className="admin-btn" disabled={busy} onClick={() => void generate("today", false)}>
          Générer (jour)
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          disabled={busy}
          onClick={() => void generate("today", true)}
        >
          Générer + e-mail
        </button>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => window.print()}>
          Imprimer
        </button>
        <Link href="/admin/parametres/notifications" className="admin-btn admin-btn-ghost">
          Paramètres rapports
        </Link>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>E-mail</th>
                <th>PDF</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                  <td>
                    {r.type}
                    {r.isTest ? " · TEST" : ""}
                    {!r.hasRealPurchase ? " · 0 achat" : ""}
                  </td>
                  <td>
                    {r.emailStatus}
                    {r.emailLastError ? ` (${r.emailLastError})` : ""}
                  </td>
                  <td>{r.pdfPath ? "oui" : "—"}</td>
                  <td className="space-x-2">
                    <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void openReport(r.id)}>
                      Voir
                    </button>
                    {r.pdfPath && (
                      <a className="admin-btn admin-btn-ghost" href={`/api/admin/reports?id=${r.id}&download=pdf`}>
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-muted">
                    Aucun rapport encore.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-card">
          <h2 className="font-semibold mb-2">Détail</h2>
          {!selected && <p className="admin-muted text-sm">Sélectionne un rapport.</p>}
          {selected && (
            <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-[70vh]">
              {JSON.stringify(
                {
                  id: selected.id,
                  title: selected.title,
                  emailStatus: selected.emailStatus,
                  emailLastError: selected.emailLastError,
                  hasRealPurchase: selected.hasRealPurchase,
                  isTest: selected.isTest,
                  summary: selected.summaryJson,
                },
                null,
                2
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
