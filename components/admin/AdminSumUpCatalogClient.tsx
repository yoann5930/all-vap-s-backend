"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";

type Row = {
  id: string;
  name: string;
  sumupName: string | null;
  category: string;
  barcode: string | null;
  sumupProductId: string | null;
  sumupVariantId: string | null;
  catalogStatus: string;
  isActive: boolean;
  visibleOnline: boolean;
  productFamily: string | null;
  source: string;
  lastCatalogImportAt: string | null;
  importAnomaly: string | null;
  priceCents: number;
  stock: number;
};

type Stats = {
  totalSumupImport: number;
  validated: number;
  toVerify: number;
  active: number;
  visible: number;
  noBarcode: number;
};

const FILTERS = [
  { id: "", label: "Tous" },
  { id: "validated", label: "Validés" },
  { id: "to_verify", label: "À vérifier" },
  { id: "no_barcode", label: "Sans code-barres" },
  { id: "ambiguous", label: "Ambigus" },
  { id: "active", label: "Actifs" },
  { id: "invisible", label: "Invisibles" },
] as const;

export function AdminSumUpCatalogClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [families, setFamilies] = useState<Array<{ family: string | null; count: number }>>([]);
  const [filter, setFilter] = useState("");
  const [family, setFamily] = useState("");
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("take", "100");
      if (filter) params.set("filter", filter);
      if (family) params.set("family", family);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/catalog/sumup-raw?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setStats(data.stats || null);
      setFamilies(data.families || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [filter, family, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Importés", stats.totalSumupImport],
            ["Validés", stats.validated],
            ["À vérifier", stats.toVerify],
            ["Actifs", stats.active],
            ["Visibles", stats.visible],
            ["Sans EAN", stats.noBarcode],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardBody className="py-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-xl font-semibold">{value}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.id || "all"}
            type="button"
            variant={filter === f.id ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher nom, EAN, Item ID…"
          className="max-w-sm"
        />
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
        >
          <option value="">Toutes les familles</option>
          {families.map((f) => (
            <option key={f.family || "none"} value={f.family || ""}>
              {f.family || "(sans famille)"} ({f.count})
            </option>
          ))}
        </select>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Chargement…" : "Actualiser"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-sm text-gray-500">
        {total} résultat(s) — enrichissement familles non démarré (lecture seule)
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Nom SumUp</th>
              <th className="px-3 py-2">Catégorie</th>
              <th className="px-3 py-2">EAN</th>
              <th className="px-3 py-2">Item ID</th>
              <th className="px-3 py-2">Variant ID</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Actif</th>
              <th className="px-3 py-2">Visible</th>
              <th className="px-3 py-2">Famille</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Dernier import</th>
              <th className="px-3 py-2">Anomalie</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="max-w-[220px] truncate px-3 py-2" title={row.sumupName || row.name}>
                  {row.sumupName || row.name}
                </td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.barcode || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.sumupProductId?.slice(0, 8) || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.sumupVariantId?.slice(0, 8) || "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={row.catalogStatus === "valide" ? "success" : "warning"}>
                    {row.catalogStatus}
                  </Badge>
                </td>
                <td className="px-3 py-2">{row.isActive ? "oui" : "non"}</td>
                <td className="px-3 py-2">{row.visibleOnline ? "oui" : "non"}</td>
                <td className="px-3 py-2">{row.productFamily || "—"}</td>
                <td className="px-3 py-2">{row.source}</td>
                <td className="px-3 py-2 text-xs">
                  {row.lastCatalogImportAt
                    ? new Date(row.lastCatalogImportAt).toLocaleString("fr-FR")
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-amber-700">{row.importAnomaly || "—"}</td>
              </tr>
            ))}
            {!items.length && !loading && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-gray-500">
                  Aucun produit
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
