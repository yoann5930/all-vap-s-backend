"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";

interface PreviewRow {
  rowIndex: number;
  name: string;
  action: string;
  quantity: number | null;
  quantityBefore: number | null;
  quantityAfter: number | null;
  confidence: number;
  message: string;
}

interface PreviewResult {
  dryRun: boolean;
  applied?: boolean;
  message?: string;
  syncRunId?: string;
  locationCode: string;
  locationName: string;
  detectedColumns: Record<string, string | null>;
  totalRows: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  unmatchedCount: number;
  reviewCount: number;
  duplicateCount: number;
  errorCount: number;
  rows: PreviewRow[];
  errors: Array<{ rowIndex: number; message: string }>;
}

export function AdminSumUpImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    if (!file) {
      setError("Sélectionnez un fichier CSV SumUp.");
      return;
    }
    setLoading(true);
    setError(null);
    setApplyMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("dryRun", "true");
      const res = await fetch("/api/admin/catalog/sumup-import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Erreur simulation");
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [file]);

  const confirmApply = useCallback(async () => {
    if (!file || !preview) return;
    const ok = window.confirm(
      `Confirmer l'import RÉEL sur le stock général All Vap's ?\n` +
        `Mises à jour: ${preview.updateCount}\n` +
        `Non reconnus (non créés): ${preview.unmatchedCount}\n` +
        `À valider manuellement: ${preview.reviewCount + preview.duplicateCount}`
    );
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("dryRun", "false");
      form.set("createUnmatched", "false");
      form.set("confirmToken", "CONFIRM_SUMUP_IMPORT");
      const res = await fetch("/api/admin/catalog/sumup-import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Erreur import");
      setApplyMessage(data.message || "Import appliqué.");
      setPreview(data.preview ? { ...data.preview, dryRun: false, applied: true } : preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [file, preview]);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Stock général unique</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Emplacement : Stock général All Vap&apos;s (`GLOBAL_ALL_VAPS`).</li>
          <li>Pas de stock Hautmont / Le Quesnoy séparés.</li>
          <li>Simulation obligatoire avant écriture.</li>
          <li>Aucune quantité inventée — colonne absente = pas de modification.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-800">Cible</p>
        <p className="mt-1 text-sm text-gray-600">Stock général All Vap&apos;s</p>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-gray-700">Fichier CSV SumUp</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void runPreview()} loading={loading} disabled={!file}>
          Simuler l&apos;import
        </Button>
        <button
          type="button"
          className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={async () => {
            const res = await fetch("/api/admin/catalog/sumup-import");
            const data = await res.json();
            const blob = new Blob([data.template || ""], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "modele_sumup_import.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Télécharger modèle CSV
        </button>
        <a
          href="/api/admin/catalog/export-excel"
          className="inline-flex items-center rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Exporter CATALOGUE_STOCK_ALL_VAPS.xlsx
        </a>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {applyMessage && <p className="text-sm text-emerald-700">{applyMessage}</p>}

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Lignes", preview.totalRows],
              ["Maj stock", preview.updateCount],
              ["Non reconnus", preview.unmatchedCount],
              ["À valider / doublons", preview.reviewCount + preview.duplicateCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Ligne</th>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Avant</th>
                  <th className="px-3 py-2">Après</th>
                  <th className="px-3 py-2">Confiance</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 200).map((row) => (
                  <tr key={row.rowIndex} className="border-t border-gray-100">
                    <td className="px-3 py-2">{row.rowIndex}</td>
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2">{row.action}</td>
                    <td className="px-3 py-2">{row.quantityBefore ?? "—"}</td>
                    <td className="px-3 py-2">{row.quantityAfter ?? "—"}</td>
                    <td className="px-3 py-2">{Math.round((row.confidence || 0) * 100)}%</td>
                    <td className="px-3 py-2 text-gray-600">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.dryRun && (
            <Button type="button" onClick={() => void confirmApply()} loading={loading}>
              Confirmer l&apos;import réel (stock général)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
