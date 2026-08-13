"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UNITS_PER_BOX_ALLOWED } from "@/lib/inventory/packaging";

type BarcodeRow = {
  id: string;
  barcode: string;
  role: string;
  label: string | null;
};

type PanelData = {
  product: { id: string; name: string; barcode: string | null };
  barcodes: BarcodeRow[];
  packagingRelevant: boolean;
  unitsPerBox: number | null;
  stock: {
    global: number;
    label: string;
    fullBoxes: number | null;
    looseUnits: number | null;
  };
};

export function AdminProductPackagingPanel({ productId }: { productId: string }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBarcode, setNewBarcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/packaging-barcodes`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chargement impossible");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/packaging-barcodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action impossible");
      setMessage("Enregistré");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  if (!data && loading) {
    return <p className="mt-4 text-sm text-gray-600">Chargement conditionnement…</p>;
  }
  if (!data) {
    return error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null;
  }

  return (
    <div className="sm:col-span-2 mt-2 space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div>
        <h4 className="font-semibold text-gray-900">Codes-barres associés</h4>
        <p className="mt-1 text-xs text-gray-600">
          Plusieurs EAN = même produit et même stock. Le scan d’un alias met à jour le stock canonique.
        </p>
        <ul className="mt-3 space-y-2">
          {data.barcodes.length === 0 ? (
            <li className="text-sm text-gray-500">
              Aucun alias — primaire catalogue : {data.product.barcode || "—"}
            </li>
          ) : (
            data.barcodes.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-mono font-semibold">{b.barcode}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {b.role === "PRIMARY" ? "principal" : "secondaire"}
                    {b.label ? ` · ${b.label}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:underline"
                  disabled={loading}
                  onClick={() => {
                    if (
                      !confirm(
                        `Dissocier le code-barres ${b.barcode} de ce produit ?`
                      )
                    ) {
                      return;
                    }
                    void post({ action: "detach_barcode", barcode: b.barcode });
                  }}
                >
                  Dissocier
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            label="Ajouter un code-barres"
            value={newBarcode}
            onChange={(e) => setNewBarcode(e.target.value)}
            placeholder="EAN / UPC"
          />
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              loading={loading}
              onClick={() => {
                void post({
                  action: "attach_barcode",
                  barcode: newBarcode.trim(),
                  role: "ALIAS",
                  label: "packaging secondaire",
                }).then(() => setNewBarcode(""));
              }}
            >
              Ajouter (alias)
            </Button>
            <Button
              type="button"
              loading={loading}
              onClick={() => {
                void post({
                  action: "attach_barcode",
                  barcode: newBarcode.trim(),
                  role: "PRIMARY",
                  label: "packaging principal",
                }).then(() => setNewBarcode(""));
              }}
            >
              Définir comme principal
            </Button>
          </div>
        </div>
      </div>

      {data.packagingRelevant ? (
        <div>
          <h4 className="font-semibold text-gray-900">Conditionnement</h4>
          <p className="mt-1 text-xs text-gray-600">
            Quantité par boîte (1–5). Stock affiché : boîtes × N + unités restantes.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Quantité par boîte</span>
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={data.unitsPerBox ?? ""}
                disabled={loading}
                onChange={(e) => {
                  const v = e.target.value;
                  void post({
                    action: "set_units_per_box",
                    unitsPerBox: v === "" ? null : Number(v),
                  });
                }}
              >
                <option value="">— Non défini —</option>
                {UNITS_PER_BOX_ALLOWED.map((n) => (
                  <option key={n} value={n}>
                    {n} / boîte
                  </option>
                ))}
              </select>
            </label>
            <p className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-emerald-900 border border-emerald-200">
              {data.stock.label}
            </p>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
