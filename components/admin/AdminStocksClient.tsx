"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Package, RefreshCw } from "lucide-react";
import type { Product, Category, Brand, ProductVariant } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

type ProductWithRefs = Product & {
  categoryRef: Category | null;
  brandRef: Brand | null;
  variants?: ProductVariant[];
};

interface StocksResponse {
  products: ProductWithRefs[];
  stats: {
    total: number;
    outOfStock: number;
    lowStock: number;
    totalUnits: number;
    lastSyncAt?: string | null;
    syncLocked?: boolean;
  };
  syncRuns?: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string | null;
    errorCount: number;
    updatedCount: number;
  }>;
  events?: Array<{ id: string; type: string; message: string; createdAt: string }>;
}

export function AdminStocksClient() {
  const [data, setData] = useState<StocksResponse | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/stocks?lowStock=${lowStockOnly}&status=1`);
    setData(await res.json());
  }, [lowStockOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStock(productId: string, variantId?: string | null) {
    const key = variantId ? `${productId}:${variantId}` : productId;
    const stock = parseInt(editing[key], 10);
    if (isNaN(stock) || stock < 0) return;
    setLoading(true);
    await fetch("/api/admin/stocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, variantId, stock }),
    });
    setEditing((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
    await load();
    setLoading(false);
  }

  async function forceSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/admin/stocks/sync", { method: "POST" });
      const json = await res.json();
      setSyncMessage(json.message || (json.ok ? "Synchronisation terminée" : "Échec sync"));
      await load();
    } catch {
      setSyncMessage("Erreur de synchronisation");
    }
    setSyncing(false);
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={forceSync} loading={syncing} size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Connecter stock SumUp (CSV + miroir + ventes)
        </Button>
        {data?.stats.lastSyncAt && (
          <p className="text-sm text-gray-500">
            Dernière sync&nbsp;: {new Date(data.stats.lastSyncAt).toLocaleString("fr-FR")}
            {data.stats.syncLocked ? " — sync en cours" : ""}
          </p>
        )}
      </div>
      {syncMessage && <p className="mb-4 text-sm text-gray-700">{syncMessage}</p>}

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <StatCard icon={Package} label="Produits" value={data.stats.total} />
          <StatCard icon={AlertTriangle} label="Stock bas (≤5)" value={data.stats.lowStock} warn />
          <StatCard icon={AlertTriangle} label="Rupture" value={data.stats.outOfStock} warn />
          <StatCard icon={Package} label="Unités totales" value={data.stats.totalUnits} />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={lowStockOnly}
          onChange={(e) => setLowStockOnly(e.target.checked)}
        />
        Afficher uniquement les stocks bas / ruptures
      </label>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="pb-3 pr-4">Produit</th>
              <th className="pb-3 pr-4">Variante</th>
              <th className="pb-3 pr-4">SKU / EAN</th>
              <th className="pb-3 pr-4">Prix</th>
              <th className="pb-3 pr-4">Stock</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p) => {
              const variants = p.variants?.length ? p.variants : [null];
              return variants.map((v) => {
                const key = v ? `${p.id}:${v.id}` : p.id;
                const stockVal = v ? v.stock : p.stock;
                return (
                  <tr key={key} className="border-b">
                    <td className="py-3 pr-4 font-medium">{p.name}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {v
                        ? v.nicotineLabel ||
                          (v.nicotineMg != null ? `${v.nicotineMg} mg` : v.name)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{v?.barcode || p.sku || "—"}</td>
                    <td className="py-3 pr-4">
                      {formatPrice(v?.priceCents && v.priceCents > 0 ? v.priceCents : p.priceCents)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="w-20"
                          value={editing[key] ?? stockVal}
                          onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                        />
                        {stockVal <= 5 && (
                          <Badge variant={stockVal === 0 ? "danger" : "default"}>
                            {stockVal === 0 ? "Rupture" : "Bas"}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <Button
                        size="sm"
                        onClick={() => updateStock(p.id, v?.id)}
                        loading={loading}
                      >
                        Mettre à jour
                      </Button>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {data?.events && data.events.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Journal récent</h2>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm text-gray-600">
            {data.events.map((e) => (
              <li key={e.id}>
                <span className="font-mono text-xs text-gray-400">
                  {new Date(e.createdAt).toLocaleString("fr-FR")}
                </span>{" "}
                [{e.type}] {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.syncRuns && data.syncRuns.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">Historique synchronisations</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {data.syncRuns.map((r) => (
              <li key={r.id}>
                {new Date(r.startedAt).toLocaleString("fr-FR")} — {r.status} — maj {r.updatedCount}{" "}
                — erreurs {r.errorCount}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${warn && value > 0 ? "border-amber-200 bg-amber-50" : "bg-white"}`}
    >
      <Icon className="h-5 w-5 text-gray-400" />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
