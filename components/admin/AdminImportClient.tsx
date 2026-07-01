"use client";

import { useState } from "react";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export function AdminImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur import");
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() {
    fetch("/api/admin/import")
      .then((r) => r.json())
      .then((data) => {
        const blob = new Blob([data.template], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "all-vaps-import-template.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardBody>
          <div className="flex items-start gap-4">
            <FileSpreadsheet className="h-10 w-10 text-brand-600" />
            <div>
              <h2 className="font-semibold">Import CSV / Excel</h2>
              <p className="mt-1 text-sm text-gray-600">
                Importez vos produits en masse. Format CSV avec séparateur virgule. Exportez Excel en CSV UTF-8.
              </p>
              <Button variant="outline" className="mt-3 gap-2" onClick={downloadTemplate}>
                <Download className="h-4 w-4" /> Télécharger le modèle CSV
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold">Importer un fichier</h3>
          <input
            type="file"
            accept=".csv,.txt"
            className="mt-4 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button className="mt-4 gap-2" onClick={handleImport} loading={loading} disabled={!file}>
            <Upload className="h-4 w-4" /> Lancer l&apos;import
          </Button>

          {result && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
              <p className="font-medium text-green-700">{result.created} créé(s), {result.updated} mis à jour</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto text-red-600">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="rounded-lg border bg-wood-50/50 p-4 text-sm text-gray-600">
        <p className="font-medium text-vap-black">Colonnes supportées</p>
        <p className="mt-1">name, sku, category, brand, price, promoPrice, stock, description, imageUrl, images (séparées par |), isPromo, isNew, isBestSeller</p>
      </div>
    </div>
  );
}
