"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatEuroFromCents } from "@/lib/inventory/pricing";

type Photo = {
  id: string;
  publicUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  createdAt: string;
};

type Line = {
  id: string;
  barcode: string | null;
  productNameSnapshot: string | null;
  brandSnapshot: string | null;
  rangeSnapshot: string | null;
  categorySnapshot: string | null;
  formatSnapshot: string | null;
  nicotineSnapshot: string | null;
  catalogImageUrl: string | null;
  quantityCounted: number;
  unitPriceCents: number | null;
  totalValueCents: number | null;
  priceSource: string | null;
  notes: string | null;
  photoPath: string | null;
  scannedAt: string;
  updatedAt: string;
  product?: { name: string; imageUrl?: string | null } | null;
  photos: Photo[];
};

type Audit = {
  id: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  userEmail: string | null;
  createdAt: string;
  inventoryItemId: string | null;
};

type Inventaire = {
  id: string;
  employeeName: string;
  status: string;
  statusLabel: string;
  startedAt: string;
  completedAt: string | null;
  validatedAt: string | null;
  stockAppliedAt?: string | null;
  notes: string | null;
  location: { code: string; name: string };
  createdBy?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  lines: Line[];
  inventoryAudits: Audit[];
  summary: {
    referenceCount: number;
    totalQuantity: number;
    totalValueCents: number;
    missingPriceCount: number;
    unknownProductCount: number;
    photoCount: number;
  };
};

export function AdminInventaireDetailClient({ id }: { id: string }) {
  const [inv, setInv] = useState<Inventaire | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [editLine, setEditLine] = useState<Line | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventaires/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Introuvable");
      setInv(data.inventaire);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Affichage temps réel : relecture silencieuse tant que l’inventaire est EN COURS
  useEffect(() => {
    if (inv?.status !== "OPEN") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load({ silent: true });
    }, 4000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [inv?.status, load]);

  async function setStatus(status: string) {
    const reason = window.prompt("Motif (optionnel) :") || undefined;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/inventaires/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur statut");
      setMessage(`Statut → ${data.inventaire.statusLabel}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function applyStock() {
    if (!inv) return;
    const ok = window.confirm(
      `APPLIQUER les quantités comptées au stock officiel ${inv.location.name} ?\n\n` +
        `${inv.summary.referenceCount} références · ${inv.summary.totalQuantity} unités\n` +
        `Action irréversible (anti double application).\n` +
        `Confirmez uniquement après contrôle des écarts.`
    );
    if (!ok) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventaires/${id}/apply-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmToken: "APPLY_STOCK_CONFIRMED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur application stock");
      setMessage(
        `Stock appliqué — ${data.applied} ligne(s), ${data.skipped} ignorée(s)`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function saveLineEdit() {
    if (!editLine) return;
    if (!editReason.trim()) {
      setError("Motif de correction obligatoire");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventaires/${id}/lines/${editLine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantityCounted: parseInt(editQty, 10),
          unitPrice: editPrice,
          notes: editNotes,
          reason: editReason.trim(),
          confirmZeroPrice: editPrice.trim() === "0" || editPrice.trim() === "0,00",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur correction");
      setMessage("Ligne corrigée — audit enregistré");
      setEditLine(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(line: Line) {
    setEditLine(line);
    setEditQty(String(line.quantityCounted));
    setEditPrice(
      line.unitPriceCents != null
        ? (line.unitPriceCents / 100).toFixed(2).replace(".", ",")
        : ""
    );
    setEditNotes(line.notes || "");
    setEditReason("");
  }

  if (loading) {
    return <p className="text-sm text-gray-600">Chargement de l’inventaire…</p>;
  }
  if (error && !inv) {
    return (
      <div>
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/admin/inventaires" className="mt-3 inline-block text-sm text-emerald-800">
          ← Retour
        </Link>
      </div>
    );
  }
  if (!inv) return null;

  const summary = inv.summary || {
    referenceCount: 0,
    totalQuantity: 0,
    totalValueCents: 0,
    missingPriceCount: 0,
    unknownProductCount: 0,
    photoCount: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/inventaires" className="text-sm text-emerald-800 hover:underline">
            ← Inventaires
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Détail inventaire</h1>
          <p className="mt-1 font-mono text-xs text-gray-500">{inv.id}</p>
          {inv.status === "OPEN" ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Suivi en direct — les nouveaux scans apparaissent automatiquement
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/admin/inventaires/${id}/export?format=csv`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold"
          >
            CSV
          </a>
          <a
            href={`/api/admin/inventaires/${id}/export?format=xlsx`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold"
          >
            Excel
          </a>
          <a
            href={`/api/admin/inventaires/${id}/export?format=pdf`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold"
          >
            PDF
          </a>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Employé" value={inv.employeeName} />
        <Meta label="Boutique" value={inv.location.name} />
        <Meta
          label="Statut"
          value={inv.statusLabel}
        />
        <Meta
          label="Compte"
          value={
            inv.createdBy
              ? `${[inv.createdBy.firstName, inv.createdBy.lastName].filter(Boolean).join(" ")} (${inv.createdBy.email})`
              : "—"
          }
        />
        <Meta label="Début" value={new Date(inv.startedAt).toLocaleString("fr-FR")} />
        <Meta
          label="Fin"
          value={inv.completedAt ? new Date(inv.completedAt).toLocaleString("fr-FR") : "—"}
        />
        <Meta
          label="Validé le"
          value={inv.validatedAt ? new Date(inv.validatedAt).toLocaleString("fr-FR") : "—"}
        />
        <Meta label="Notes" value={inv.notes || "—"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void setStatus("VALIDATED")}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Valider
        </button>
        <button
          type="button"
          disabled={
            saving ||
            Boolean(inv.stockAppliedAt) ||
            !["SUBMITTED", "COMPLETED", "VALIDATED"].includes(inv.status)
          }
          onClick={() => void applyStock()}
          className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          title="Écrit le stock officiel après confirmation"
        >
          Appliquer les corrections au stock
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void setStatus("CORRECTED")}
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Marquer corrigé
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void setStatus("CANCELLED")}
          className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
      {inv.stockAppliedAt ? (
        <p className="text-xs text-violet-800">
          Stock déjà appliqué le {new Date(inv.stockAppliedAt).toLocaleString("fr-FR")}
        </p>
      ) : null}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="av-contrast-table overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full bg-white text-left text-sm text-black">
          <thead className="border-b bg-gray-50 text-xs uppercase text-black">
            <tr>
              <th className="px-3 py-3 font-semibold text-black">Photo</th>
              <th className="px-3 py-3 font-semibold text-black">Produit</th>
              <th className="px-3 py-3 font-semibold text-black">Code-barres</th>
              <th className="px-3 py-3 font-semibold text-black">Qté</th>
              <th className="px-3 py-3 font-semibold text-black">Prix</th>
              <th className="px-3 py-3 font-semibold text-black">Total</th>
              <th className="px-3 py-3 font-semibold text-black">Scan</th>
              <th className="px-3 py-3 font-semibold text-black"></th>
            </tr>
          </thead>
          <tbody className="bg-white text-black">
            {(inv.lines || []).map((l) => {
              const photos = l.photos || [];
              const thumb =
                photos[0]?.publicUrl || l.photoPath || l.catalogImageUrl || l.product?.imageUrl;
              const name = l.productNameSnapshot || l.product?.name || "Produit inconnu";
              return (
                <tr key={l.id} className="border-b bg-white text-black align-top last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-3 text-black">
                    {thumb ? (
                      <button
                        type="button"
                        onClick={() => setLightbox({ url: thumb, name })}
                        className="group w-24 text-left"
                      >
                        <span className="relative block overflow-hidden rounded-lg ring-1 ring-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumb}
                            alt={name}
                            className="h-16 w-24 object-cover"
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 text-[10px] font-semibold leading-tight text-white">
                            {name}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-16 w-24 flex-col items-center justify-center rounded-lg bg-red-50 px-1 text-center text-[10px] font-semibold text-red-700">
                        <span>Sans photo</span>
                        <span className="mt-0.5 line-clamp-2 font-medium text-red-600/80">{name}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-black">
                    <p className="font-semibold text-black">{name}</p>
                    <p className="text-xs text-black/70">
                      {[l.brandSnapshot, l.rangeSnapshot ? `gamme ${l.rangeSnapshot}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    <p className="text-xs text-black/70">
                      {[l.formatSnapshot, l.nicotineSnapshot].filter(Boolean).join(" · ") || ""}
                    </p>
                    {l.priceSource ? (
                      <p className="text-[11px] text-black/60">tarif {l.priceSource}</p>
                    ) : null}
                    {l.notes ? (
                      <p className="mt-1 text-xs text-black/80">Note : {l.notes}</p>
                    ) : null}
                    {photos[0] ? (
                      <a
                        href={photos[0].publicUrl}
                        download
                        className="mt-1 inline-block text-xs font-semibold text-black underline"
                      >
                        Télécharger photo
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold text-black">
                    {l.barcode || "—"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-black">{l.quantityCounted}</td>
                  <td className="px-3 py-3 text-black">
                    {formatEuroFromCents(l.unitPriceCents)}
                    <div className="text-[10px] uppercase text-black/60">
                      {l.priceSource || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-medium text-black">
                    {formatEuroFromCents(l.totalValueCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-black">
                    <div>{new Date(l.scannedAt).toLocaleString("fr-FR")}</div>
                    <div className="text-black/60">
                      mod. {new Date(l.updatedAt).toLocaleString("fr-FR")}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-black">
                    <button
                      type="button"
                      onClick={() => openEdit(l)}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-black"
                    >
                      Corriger
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Meta label="Références" value={String(summary.referenceCount)} />
        <Meta label="Quantité totale" value={String(summary.totalQuantity)} />
        <Meta
          label="Valeur totale estimée"
          value={formatEuroFromCents(summary.totalValueCents)}
        />
        <Meta label="Sans prix" value={String(summary.missingPriceCount)} />
        <Meta label="Produits inconnus" value={String(summary.unknownProductCount)} />
        <Meta label="Photos jointes" value={String(summary.photoCount)} />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Journal d’audit</h2>
        {(inv.inventoryAudits || []).length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Aucune entrée d’audit inventaire.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(inv.inventoryAudits || []).map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700"
              >
                <span className="font-semibold">{a.action}</span>
                {a.fieldName ? ` · ${a.fieldName}` : ""}
                {" — "}
                <span className="text-gray-500">{a.oldValue ?? "∅"}</span>
                {" → "}
                <span className="font-medium">{a.newValue ?? "∅"}</span>
                <div className="mt-0.5 text-gray-500">
                  {a.userEmail || "?"} · {new Date(a.createdAt).toLocaleString("fr-FR")}
                  {a.reason ? ` · ${a.reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editLine && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4">
            <h3 className="font-semibold">Corriger la ligne</h3>
            <p className="mt-1 text-xs text-gray-500">{editLine.id}</p>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                Quantité
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Prix unitaire (€)
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Commentaire
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Motif (obligatoire)
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border px-3 py-2 text-sm font-semibold"
                onClick={() => setEditLine(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving}
                className="flex-1 rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void saveLineEdit()}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="max-h-[82vh] max-w-full rounded-lg object-contain"
            />
            <p className="mt-3 rounded-lg bg-black/70 px-3 py-2 text-center text-sm font-semibold text-white">
              {lightbox.name}
            </p>
            <button
              type="button"
              className="mt-2 w-full rounded-lg bg-white/15 py-2 text-sm font-semibold text-white"
              onClick={() => setLightbox(null)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 break-words">{value}</p>
    </div>
  );
}
