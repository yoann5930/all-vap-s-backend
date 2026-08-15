"use client";

import { useEffect, useState } from "react";
import { PROMO_10ML_LABEL } from "@/lib/promotions/promo-10ml";

type PromoRow = {
  id: string;
  name: string;
  productType: string | null;
  volumeMl: number | null;
  promotion10mlEligible: boolean;
  category: string;
  visibleOnline: boolean;
};

export default function AdminPromotionsPage() {
  const [products, setProducts] = useState<
    Array<{ id: string; name: string; isPromo: boolean; isNew: boolean; isBestSeller: boolean }>
  >([]);
  const [promo10, setPromo10] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/products?legacy=true&all=true")
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => setProducts([]));
    refreshPromo10();
  }, []);

  async function refreshPromo10() {
    const res = await fetch("/api/admin/promotions?type=promo10ml");
    if (res.ok) {
      const data = await res.json();
      setPromo10(Array.isArray(data) ? data : data.items || []);
    }
  }

  async function markEligible10ml() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/promotions?type=promo10ml-sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessage(
        `Offre 10 ml : ${data.marked} produit(s) éligible(s), ${data.cleared} retiré(s) (50/100 exclus).`
      );
      await refreshPromo10();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function toggleEligible(id: string, value: boolean) {
    const res = await fetch("/api/admin/promotions?type=promo10ml-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id, promotion10mlEligible: value }),
    });
    if (res.ok) await refreshPromo10();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Promotions & badges</h1>
      <p className="mt-1 text-gray-600">
        Gérez les produits en promotion, nouveautés et best-sellers depuis la fiche produit.
      </p>

      <section className="mt-8 rounded-xl border border-brand-200 bg-brand-50/40 p-5">
        <h2 className="text-lg font-semibold text-gray-900">{PROMO_10ML_LABEL}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Applicable <strong>uniquement</strong> aux e-liquides 10 ml (volumeMl = 10).
          Paliers 6,90 → 3,90 €, puis 5+1 jusqu’à 10+6, calculés au panier. Les 50 ml, 100 ml,
          pods, DIY, etc. sont exclus.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={markEligible10ml}
          className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Synchronisation…" : "Synchroniser l’éligibilité 10 ml"}
        </button>
        {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
        <p className="mt-4 text-sm text-gray-700">
          Produits actuellement éligibles : <strong>{promo10.length}</strong>
        </p>
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
          {promo10.slice(0, 40).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded border bg-white px-3 py-2">
              <span className="truncate font-medium">{p.name}</span>
              <button
                type="button"
                className="shrink-0 text-xs text-red-600"
                onClick={() => toggleEligible(p.id, false)}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 space-y-2">
        {products
          .filter((p) => p.isPromo || p.isNew || p.isBestSeller)
          .map((p) => (
            <div key={p.id} className="flex gap-2 rounded-lg border px-4 py-3 text-sm">
              <span className="font-medium">{p.name}</span>
              {p.isPromo && <span className="rounded bg-red-100 px-2 text-red-700">Promo</span>}
              {p.isNew && <span className="rounded bg-blue-100 px-2 text-blue-700">Nouveau</span>}
              {p.isBestSeller && (
                <span className="rounded bg-amber-100 px-2 text-amber-700">Best-seller</span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
