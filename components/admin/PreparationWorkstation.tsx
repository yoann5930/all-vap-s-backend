"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Item = {
  id: string;
  quantity: number;
  product: { name: string; imageUrl: string | null };
  variant: { name: string; nicotineLabel: string | null; nicotineMg: number | null } | null;
};

export function PreparationWorkstation({
  orderId,
  status,
  items,
}: {
  orderId: string;
  status: string;
  items: Item[];
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const allChecked = useMemo(
    () => items.length > 0 && items.every((i) => checked[i.id]),
    [items, checked]
  );

  async function run(action: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Action impossible");
        return;
      }
      setMsg("Statut mis à jour.");
      router.refresh();
    } catch {
      setErr("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {status === "PAID" && (
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={busy}
            onClick={() => run("prepare")}
          >
            1. Démarrer la préparation
          </button>
        )}
        {status === "PREPARING" && (
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={busy || !allChecked}
            onClick={() => run("mark_prepared")}
            title={!allChecked ? "Contrôlez tous les produits" : undefined}
          >
            4–6. Marquer préparée / prête
          </button>
        )}
        {!allChecked && status === "PREPARING" && (
          <p className="text-sm text-[#f0a020]">
            Cochez chaque produit contrôlé avant validation finale.
          </p>
        )}
      </div>
      {err && <p className="text-sm text-[#ff8a95]">{err}</p>}
      {msg && <p className="text-sm text-[#2bcb78]">{msg}</p>}

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          "Préparation démarrée",
          "Produits prélevés",
          "Produits contrôlés",
          "Documents imprimés",
          "Colis préparé",
          "Commande prête",
        ].map((step, i) => (
          <li
            key={step}
            className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-sm text-[#8b95a5]"
          >
            <span className="mr-2 text-[#2f7cff]">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        {items.map((item) => {
          const variant =
            item.variant &&
            [
              item.variant.name,
              item.variant.nicotineLabel ||
                (item.variant.nicotineMg != null ? `${item.variant.nicotineMg} mg` : null),
            ]
              .filter(Boolean)
              .join(" · ");
          return (
            <label
              key={item.id}
              className={`admin-card flex cursor-pointer gap-4 p-4 ${
                checked[item.id] ? "border-[rgba(43,203,120,0.35)]" : ""
              }`}
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white/[0.04]">
                {item.product.imageUrl ? (
                  <Image
                    src={item.product.imageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-[#8b95a5]">
                    N/A
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[#f2f4f7]">{item.product.name}</p>
                {variant && <p className="text-sm text-[#8b95a5]">{variant}</p>}
                <p className="mt-1 text-sm text-[#8eb6ff]">Qté : {item.quantity}</p>
              </div>
              <input
                type="checkbox"
                className="mt-2 h-6 w-6 accent-[#2f7cff]"
                checked={!!checked[item.id]}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))
                }
                aria-label={`Contrôlé ${item.product.name}`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
