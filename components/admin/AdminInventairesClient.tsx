"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEuroFromCents } from "@/lib/inventory/pricing";

type InventaireRow = {
  id: string;
  employeeName: string;
  storeCode: string;
  storeName: string;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  statusLabel: string;
  productCount: number;
  totalQuantity: number;
  photoCount: number;
  totalValueCents: number;
  missingPriceCount: number;
  updatedAt: string;
};

const STATUS_FILTERS = [
  { value: "", label: "Tous" },
  { value: "OPEN", label: "EN COURS" },
  { value: "COMPLETED", label: "TERMINÉ" },
  { value: "VALIDATED", label: "VALIDÉ" },
  { value: "CORRECTED", label: "CORRIGÉ" },
  { value: "CANCELLED", label: "ANNULÉ" },
];

function statusClass(status: string) {
  switch (status) {
    case "OPEN":
      return "bg-amber-100 text-amber-900";
    case "COMPLETED":
      return "bg-sky-100 text-sky-900";
    case "VALIDATED":
      return "bg-emerald-100 text-emerald-900";
    case "CORRECTED":
      return "bg-violet-100 text-violet-900";
    case "CANCELLED":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function AdminInventairesClient() {
  const [rows, setRows] = useState<InventaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [store, setStore] = useState("");
  const [q, setQ] = useState("");
  const [resetting, setResetting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (store) params.set("store", store);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/inventaires?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur chargement");
      setRows(data.inventaires || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function resetInventaires() {
    const ok = window.confirm(
      "Remise à zéro : annuler tous les inventaires EN COURS et TERMINÉS non validés ?\nLes stocks déjà appliqués ne sont pas modifiés ici."
    );
    if (!ok) return;
    setResetting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/inventaires/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, includeCompleted: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur reset");
      setMessage(data.message || "Inventaires remis à zéro");
      setStatus("CANCELLED");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, store]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventaires</h1>
          <p className="mt-1 text-sm text-gray-600">
            Consultation complète — employé, boutique, code-barres, prix, photos, historique.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={resetting}
            onClick={() => void resetInventaires()}
            className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {resetting ? "Reset…" : "Remise à zéro"}
          </button>
          <Link
            href="/admin/inventaire"
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800"
          >
            Saisie admin
          </Link>
        </div>
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value || "all"} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={store}
          onChange={(e) => setStore(e.target.value)}
        >
          <option value="">Toutes boutiques</option>
          <option value="HAUTMONT">Hautmont</option>
          <option value="LE_QUESNOY">Le Quesnoy</option>
        </select>
        <input
          className="min-w-[180px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Rechercher employé ou ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Filtrer
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-600">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          Aucun inventaire trouvé.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Employé</th>
                <th className="px-3 py-3">Boutique</th>
                <th className="px-3 py-3">Début</th>
                <th className="px-3 py-3">Fin</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Produits</th>
                <th className="px-3 py-3">Qté</th>
                <th className="px-3 py-3">Photos</th>
                <th className="px-3 py-3">Valeur</th>
                <th className="px-3 py-3">Modifié</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-3 font-mono text-xs">
                    <Link
                      href={`/admin/inventaires/${r.id}`}
                      className="font-semibold text-emerald-800 underline-offset-2 hover:underline"
                    >
                      {r.id.slice(0, 12)}…
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-medium">{r.employeeName}</td>
                  <td className="px-3 py-3">{r.storeName}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {new Date(r.startedAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.completedAt
                      ? new Date(r.completedAt).toLocaleString("fr-FR")
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3">{r.productCount}</td>
                  <td className="px-3 py-3">{r.totalQuantity}</td>
                  <td className="px-3 py-3">{r.photoCount}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatEuroFromCents(r.totalValueCents)}
                    {r.missingPriceCount > 0 ? (
                      <span className="ml-1 text-xs text-amber-700">
                        ({r.missingPriceCount} s/prix)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                    {new Date(r.updatedAt).toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
