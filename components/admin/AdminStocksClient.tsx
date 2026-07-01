"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Package } from "lucide-react";
import type { Product, Category, Brand } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

type ProductWithRefs = Product & { categoryRef: Category | null; brandRef: Brand | null };

interface StocksResponse {
  products: ProductWithRefs[];
  stats: { total: number; outOfStock: number; lowStock: number; totalUnits: number };
}

export function AdminStocksClient() {
  const [data, setData] = useState<StocksResponse | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/stocks?lowStock=${lowStockOnly}`);
    setData(await res.json());
  }, [lowStockOnly]);

  useEffect(() => { load(); }, [load]);

  async function updateStock(productId: string) {
    const stock = parseInt(editing[productId], 10);
    if (isNaN(stock) || stock < 0) return;
    setLoading(true);
    await fetch("/api/admin/stocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, stock }),
    });
    setEditing((e) => { const n = { ...e }; delete n[productId]; return n; });
    await load();
    setLoading(false);
  }

  return (
    <div className="mt-6">
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <StatCard icon={Package} label="Produits" value={data.stats.total} />
          <StatCard icon={AlertTriangle} label="Stock bas (≤5)" value={data.stats.lowStock} warn />
          <StatCard icon={AlertTriangle} label="Rupture" value={data.stats.outOfStock} warn />
          <StatCard icon={Package} label="Unités totales" value={data.stats.totalUnits} />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
        Afficher uniquement les stocks bas
      </label>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="pb-3 pr-4">Produit</th>
              <th className="pb-3 pr-4">SKU</th>
              <th className="pb-3 pr-4">Catégorie</th>
              <th className="pb-3 pr-4">Prix</th>
              <th className="pb-3 pr-4">Stock</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-3 pr-4 font-medium">{p.name}</td>
                <td className="py-3 pr-4 text-gray-500">{p.sku || "—"}</td>
                <td className="py-3 pr-4">{p.categoryRef?.name || p.category}</td>
                <td className="py-3 pr-4">{formatPrice(p.priceCents)}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-20"
                      value={editing[p.id] ?? p.stock}
                      onChange={(e) => setEditing({ ...editing, [p.id]: e.target.value })}
                    />
                    {p.stock <= 5 && (
                      <Badge variant={p.stock === 0 ? "danger" : "default"}>
                        {p.stock === 0 ? "Rupture" : "Bas"}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-3">
                  <Button size="sm" onClick={() => updateStock(p.id)} loading={loading}>
                    Mettre à jour
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, warn }: { icon: typeof Package; label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn && value > 0 ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
      <Icon className="h-5 w-5 text-gray-400" />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
