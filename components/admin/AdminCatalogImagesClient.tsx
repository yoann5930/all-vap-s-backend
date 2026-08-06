"use client";

import { useCallback, useEffect, useState } from "react";

type CatalogImage = {
  id: string;
  url: string;
  status: string;
  sortOrder: number;
  createdAt: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  range: string | null;
  imageUrl: string | null;
  imageStatus: string | null;
  catalogImages: CatalogImage[];
};

const STATUS_LABELS: Record<string, string> = {
  official: "Officielle",
  pending: "À venir",
  validated: "Validée",
};

export function AdminCatalogImagesClient() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [attachForm, setAttachForm] = useState<{
    productId: string;
    url: string;
    status: "official" | "pending" | "validated";
  }>({ productId: "", url: "", status: "pending" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/catalog/images");
      const json = await res.json();
      setProducts(json.products ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(imageId: string, status: "official" | "pending" | "validated") {
    setMessage(null);
    const res = await fetch("/api/admin/catalog/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, status }),
    });
    if (res.ok) {
      setMessage("Statut image mis à jour");
      void load();
    } else {
      setMessage("Erreur mise à jour");
    }
  }

  async function attachImage(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/catalog/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attachForm),
    });
    if (res.ok) {
      setMessage("Image attachée — prête pour validation Yoann");
      setAttachForm({ productId: "", url: "", status: "pending" });
      void load();
    } else {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? "Erreur attachement (photo groupe refusée)");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Attacher une image (bouteille seule)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Statuts : officielle · à venir · validée — les photos de groupe sont automatiquement refusées.
        </p>
        <form onSubmit={attachImage} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            required
            value={attachForm.productId}
            onChange={(e) => setAttachForm((f) => ({ ...f, productId: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Produit…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            required
            type="url"
            placeholder="URL image bouteille"
            value={attachForm.url}
            onChange={(e) => setAttachForm((f) => ({ ...f, url: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={attachForm.status}
            onChange={(e) =>
              setAttachForm((f) => ({ ...f, status: e.target.value as "official" | "pending" | "validated" }))
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="pending">À venir</option>
            <option value="official">Officielle</option>
            <option value="validated">Validée</option>
          </select>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white sm:col-span-2 lg:col-span-1">
            Attacher
          </button>
        </form>
      </section>

      {message && <p className="text-sm text-brand-700">{message}</p>}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Images catalogue ({products.length})</h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Chargement…</p>
        ) : products.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Aucun produit — importez le catalogue d&apos;abord.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {products.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="h-20 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">À venir</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {[p.brand, p.range].filter(Boolean).join(" · ")}
                  </p>
                  {p.catalogImages.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-600">Aucune image catalogue — placeholder actif</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {p.catalogImages.map((img) => (
                        <li key={img.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="truncate text-gray-600">{img.url.split("/").pop()}</span>
                          <span className="rounded bg-gray-100 px-2 py-0.5">{STATUS_LABELS[img.status] ?? img.status}</span>
                          {img.status !== "validated" && (
                            <button
                              type="button"
                              onClick={() => updateStatus(img.id, "validated")}
                              className="text-brand-600 hover:underline"
                            >
                              Valider
                            </button>
                          )}
                          {img.status !== "official" && (
                            <button
                              type="button"
                              onClick={() => updateStatus(img.id, "official")}
                              className="text-gray-500 hover:underline"
                            >
                              Officielle
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
