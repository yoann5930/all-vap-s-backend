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

type StoreCode = "HAUTMONT" | "LE_QUESNOY";

export function AdminSumUpImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [locationCode, setLocationCode] = useState<StoreCode>("HAUTMONT");
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
      form.set("locationCode", locationCode);
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
  }, [file, locationCode]);

  const confirmApply = useCallback(async () => {
    if (!file || !preview) return;
    const ok = window.confirm(
      `Confirmer l'import RÉEL sur ${preview.locationName} (${preview.locationCode}) ?\n` +
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
      form.set("locationCode", locationCode);
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
  }, [file, preview, locationCode]);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Double stock boutique</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Cible obligatoire : Hautmont ou Le Quesnoy.</li>
          <li>Le stock global affiché = somme des deux boutiques (calculé).</li>
          <li>Simulation obligatoire avant écriture.</li>
          <li>Aucune quantité inventée — colonne absente = pas de modification.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Boutique cible</span>
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={locationCode}
            onChange={(e) => setLocationCode(e.target.value as StoreCode)}
          >
            <option value="HAUTMONT">All Vap&apos;s Hautmont</option>
            <option value="LE_QUESNOY">All Vap&apos;s Le Quesnoy</option>
          </select>
        </label>
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
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <p className="font-semibold text-gray-900">
              {preview.locationName} ({preview.locationCode})
            </p>
            <p className="mt-2 text-gray-600">
              Lignes {preview.totalRows} · MAJ {preview.updateCount} · Non reconnus{" "}
              {preview.unmatchedCount} · Doublons {preview.duplicateCount} · Erreurs{" "}
              {preview.errorCount}
            </p>
            {!preview.applied && preview.dryRun && (
              <Button type="button" className="mt-4" onClick={() => void confirmApply()} loading={loading}>
                Confirmer l&apos;import réel
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Avant</th>
                  <th className="px-3 py-2">Après</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r) => (
                  <tr key={r.rowIndex} className="border-b">
                    <td className="px-3 py-2">{r.rowIndex}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.action}</td>
                    <td className="px-3 py-2">{r.quantityBefore ?? "—"}</td>
                    <td className="px-3 py-2">{r.quantityAfter ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
