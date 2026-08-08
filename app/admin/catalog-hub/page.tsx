"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Upload, Download, Image as ImageIcon, Warehouse, History } from "lucide-react";

const sections = [
  { href: "/admin/products", label: "Produits", icon: Package, desc: "CRUD catalogue" },
  { href: "/admin/catalog/classification", label: "Classification", icon: History, desc: "Fabricant → Gamme → Produit" },
  { href: "/admin/import", label: "Importer CSV", icon: Upload, desc: "Import générique" },
  { href: "/admin/catalog-images", label: "Images", icon: ImageIcon, desc: "Photos bouteille seule" },
  { href: "/admin/sumup-import", label: "Import SumUp CSV", icon: Warehouse, desc: "Import manuel CSV stock" },
  { href: "/api/admin/catalog/export-excel", label: "Exporter Excel", icon: Download, desc: "Télécharger le catalogue" },
  { href: "/admin/stocks", label: "Stocks", icon: Warehouse, desc: "Stock général All Vap's" },
  { href: "/admin/catalog", label: "Historique sync", icon: History, desc: "Runs & correspondances" },
];

export default function CatalogHubPage() {
  const [importResult, setImportResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sumupSyncResult, setSumupSyncResult] = useState<string | null>(null);

  async function triggerSumUpApiSync(dryRun: boolean) {
    setLoading(true);
    setSumupSyncResult(null);
    try {
      const res = await fetch("/api/admin/catalog/sumup-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, force: true }),
      });
      const json = await res.json();
      setSumupSyncResult(
        json.message ||
          `Sync: ${json.transactionsFetched} tx · ventes ${json.salesApplied} · remb. ${json.refundsApplied} · erreurs ${json.errors?.length ?? 0}`
      );
    } catch {
      setSumupSyncResult("Erreur sync SumUp API");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnifiedImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/catalog/unified-import?dryRun=false", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      setImportResult(
        `Lu: ${json.read} · Créés: ${json.created} · MAJ: ${json.updated} · Images: ${json.imagesAttached} · Erreurs: ${json.errors?.length ?? 0}`
      );
    } catch {
      setImportResult("Erreur import");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function seedRanges() {
    setLoading(true);
    try {
      await fetch("/api/admin/catalog/unified-import?action=seed-ranges", { method: "POST" });
      setImportResult("Gammes Liquidarom initialisées (Ice Cool, Les Collègues, Les Essentiels, Edition Collector)");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Catalogue professionnel</h1>
        <p className="mt-1 text-sm text-gray-600">
          Base produit unique — site, A.V.A., recherche, filtres, stock, SumUp
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
          >
            <s.icon className="mt-0.5 h-5 w-5 text-brand-500" />
            <div>
              <p className="font-semibold text-gray-900">{s.label}</p>
              <p className="text-sm text-gray-500">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ImageIcon className="h-5 w-5" aria-hidden="true" />
          Import unifié &amp; gammes
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          CSV / Excel — mise à jour sans doublons. Photos bouteille seule (official / pending / validated).
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            {loading ? "Import…" : "Importer CSV / Excel"}
            <input type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={handleUnifiedImport} />
          </label>
          <button
            type="button"
            onClick={seedRanges}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Initialiser gammes Liquidarom
          </button>
        </div>
        {importResult && <p className="mt-4 text-sm text-gray-700">{importResult}</p>}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Warehouse className="h-5 w-5" aria-hidden="true" />
          Sync SumUp API (stock général)
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Récupère les ventes SumUp côté serveur, met à jour PostgreSQL et exporte les catalogues CSV.
          La sync automatique reste désactivée tant que <code className="text-xs">SUMUP_SYNC_ENABLED=false</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => triggerSumUpApiSync(true)}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Dry-run API
          </button>
          <button
            type="button"
            onClick={() => triggerSumUpApiSync(false)}
            disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Sync une fois
          </button>
        </div>
        {sumupSyncResult && <p className="mt-4 text-sm text-gray-700">{sumupSyncResult}</p>}
      </section>
    </div>
  );
}
