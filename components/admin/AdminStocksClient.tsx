"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Package } from "lucide-react";
import type { Product, Category, Brand } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

type ProductWithRefs = Product & {
  categoryRef: Category | null;
  brandRef: Brand | null;
  stockHautmont: number;
  stockLeQuesnoy: number;
  stockGlobal: number;
};

interface StocksResponse {
  products: ProductWithRefs[];
  stats: {
    total: number;
    outOfStock: number;
    lowStock: number;
    totalUnits: number;
    totalHautmont: number;
    totalLeQuesnoy: number;
  };
}

type EditKey = `${string}:HAUTMONT` | `${string}:LE_QUESNOY`;

export function AdminStocksClient() {
  const [data, setData] = useState<StocksResponse | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/stocks?lowStock=${lowStockOnly}`);
    setData(await res.json());
  }, [lowStockOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStock(productId: string, locationCode: "HAUTMONT" | "LE_QUESNOY") {
    const key: EditKey = `${productId}:${locationCode}`;
    const stock = parseInt(editing[key], 10);
    if (isNaN(stock) || stock < 0) return;
    setLoading(true);
    await fetch("/api/admin/stocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, locationCode, stock }),
    });
    setEditing((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
    await load();
    setLoading(false);
  }

  return (
    <div className="mt-6">
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Package} label="Produits" value={data.stats.total} />
          <StatCard icon={Package} label="Hautmont" value={data.stats.totalHautmont} />
          <StatCard icon={Package} label="Le Quesnoy" value={data.stats.totalLeQuesnoy} />
          <StatCard icon={Package} label="Global (somme)" value={data.stats.totalUnits} />
          <StatCard icon={AlertTriangle} label="Stock bas (≤5)" value={data.stats.lowStock} warn />
          <StatCard icon={AlertTriangle} label="Rupture globale" value={data.stats.outOfStock} warn />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={lowStockOnly}
          onChange={(e) => setLowStockOnly(e.target.checked)}
        />
        Afficher uniquement les stocks bas (global)
      </label>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="pb-3 pr-4">Produit</th>
              <th className="pb-3 pr-4">SKU</th>
              <th className="pb-3 pr-4">Prix</th>
              <th className="pb-3 pr-4">Hautmont</th>
              <th className="pb-3 pr-4">Le Quesnoy</th>
              <th className="pb-3 pr-4">Global</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p) => {
              const keyH = `${p.id}:HAUTMONT`;
              const keyQ = `${p.id}:LE_QUESNOY`;
              return (
                <tr key={p.id} className="border-b align-top">
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className="py-3 pr-4 text-gray-500">{p.sku || "—"}</td>
                  <td className="py-3 pr-4">{formatPrice(p.priceCents)}</td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      className="w-20"
                      value={editing[keyH] ?? p.stockHautmont}
                      onChange={(e) => setEditing({ ...editing, [keyH]: e.target.value })}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Input
                      type="number"
                      className="w-20"
                      value={editing[keyQ] ?? p.stockLeQuesnoy}
                      onChange={(e) => setEditing({ ...editing, [keyQ]: e.target.value })}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.stockGlobal}</span>
                      {p.stockGlobal <= 5 && (
                        <Badge variant={p.stockGlobal === 0 ? "danger" : "default"}>
                          {p.stockGlobal === 0 ? "Rupture" : "Bas"}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateStock(p.id, "HAUTMONT")}
                        loading={loading}
                      >
                        Maj Hautmont
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStock(p.id, "LE_QUESNOY")}
                        loading={loading}
                      >
                        Maj Le Quesnoy
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Icon className={`h-4 w-4 ${warn ? "text-amber-500" : "text-brand-600"}`} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
