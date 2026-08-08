"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  rawName: string;
  displayName: string;
  manufacturer: { slug: string; name: string } | null;
  range: { slug: string; name: string } | null;
  volumeMl: number | null;
  sku: string | null;
  barcode: string | null;
  category: string;
  status: string;
  sources: string | null;
};

const STATUSES = [
  "CONFIRMED",
  "AUTO_CLASSIFIED",
  "TO_REVIEW",
  "UNCLASSIFIED",
] as const;

export default function CatalogClassificationPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [range, setRange] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (manufacturer) sp.set("manufacturer", manufacturer);
      if (range) sp.set("range", range);
      if (q) sp.set("q", q);
      sp.set("take", "150");
      const res = await fetch(`/api/admin/catalog/classification?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur chargement");
      setItems(json.items || []);
      setTotal(json.total || 0);
      setStatusCounts(json.statusCounts || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status, manufacturer, range, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 text-gray-900">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-brand-700">
            <Link href="/admin/catalog-hub" className="hover:underline">
              Catalogue
            </Link>{" "}
            / Classification
          </p>
          <h1 className="mt-1 text-2xl font-bold">Classification produits</h1>
          <p className="mt-1 text-sm text-gray-600">
            Fabricant → Gamme → Produit (sans modification des stocks). Total filtré :{" "}
            {total}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Rafraîchir
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded-full border px-3 py-1 ${
              status === s
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {s} ({statusCounts[s] ?? 0})
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Recherche nom / SKU / EAN"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          placeholder="Slug fabricant (ex. liquidarom)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={range}
          onChange={(e) => setRange(e.target.value)}
          placeholder="Slug gamme (ex. ice-cool)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-gray-500">Chargement…</p> : null}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Produit brut</th>
              <th className="px-3 py-2">Fabricant</th>
              <th className="px-3 py-2">Gamme</th>
              <th className="px-3 py-2">Normalisé</th>
              <th className="px-3 py-2">ml</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">EAN</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Sources</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-gray-100 align-top">
                <td className="max-w-[220px] px-3 py-2 text-gray-800">{it.rawName}</td>
                <td className="px-3 py-2">
                  {it.manufacturer ? (
                    <Link
                      href={`/fabricants/${it.manufacturer.slug}`}
                      className="text-brand-700 hover:underline"
                    >
                      {it.manufacturer.name}
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {it.range ? (
                    <span title={it.range.slug}>{it.range.name}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="max-w-[180px] px-3 py-2 text-gray-600">{it.displayName}</td>
                <td className="px-3 py-2">{it.volumeMl ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.sku || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.barcode || "—"}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                    {it.status}
                  </span>
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 font-mono text-[10px] text-gray-500">
                  {it.sources || "—"}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                  Aucun produit
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
