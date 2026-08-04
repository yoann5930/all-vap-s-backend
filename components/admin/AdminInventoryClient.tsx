"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { flushOfflineInventoryQueue, queueOfflineInventoryLine } from "@/lib/inventory/offline-queue";

type StoreCode = "HAUTMONT" | "LE_QUESNOY";

interface InventoryLine {
  id: string;
  barcode: string | null;
  quantityCounted: number;
  photoPath?: string | null;
  createdAt?: string;
  product?: {
    id: string;
    name: string;
    barcode?: string | null;
    imageUrl?: string | null;
    priceCents?: number | null;
    promoPriceCents?: number | null;
  } | null;
}

interface Session {
  id: string;
  employeeName: string;
  status: string;
  startedAt?: string;
  completedAt?: string | null;
  location: { code: string; name: string };
  lines?: InventoryLine[];
  _count?: { lines: number };
}

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Prix unitaire effectif (promo prioritaire) en centimes, ou null si inconnu. */
function unitPriceCents(line: InventoryLine): number | null {
  const p = line.product;
  if (!p) return null;
  const cents = p.promoPriceCents ?? p.priceCents;
  return typeof cents === "number" ? cents : null;
}

function formatCents(cents: number | null): string {
  return cents == null ? "—" : EUR.format(cents / 100);
}

function sessionTotalCents(session: Session): number {
  return (session.lines || []).reduce((sum, l) => {
    const unit = unitPriceCents(l);
    return unit == null ? sum : sum + unit * l.quantityCounted;
  }, 0);
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR");
}

export function AdminInventoryClient() {
  const [employeeName, setEmployeeName] = useState("");
  const [locationCode, setLocationCode] = useState<StoreCode>("HAUTMONT");
  const [session, setSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastLineIdRef = useRef<string | null>(null);

  async function lookupBarcode(code: string) {
    try {
      const res = await fetch(`/api/admin/inventory/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) return;
      if (data.found) {
        setLookupHint(
          `${data.product.name} — H:${data.product.stockHautmont} · Q:${data.product.stockLeQuesnoy} · Σ:${data.product.stockGlobal}`
        );
      } else {
        setLookupHint("Produit non reconnu — la ligne sera quand même enregistrée");
      }
    } catch {
      setLookupHint(null);
    }
  }

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/admin/inventory/sessions");
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.sessions || []);
  }, []);

  const refreshSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/inventory/sessions/${id}/lines`);
    if (!res.ok) return;
    const data = await res.json();
    setSession(data.session);
  }, []);

  useEffect(() => {
    loadSessions();
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void flushOfflineInventoryQueue();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void flushOfflineInventoryQueue();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [loadSessions]);

  async function startSession() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName, locationCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur session");
      setSession(data.session);
      setMessage(`Session ouverte — ${data.session.location.name}`);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function addLine() {
    if (!session) return;
    const qty = parseInt(quantity, 10);
    if (!barcode.trim() || isNaN(qty) || qty < 0) {
      setError("Code-barres et quantité requis");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        await queueOfflineInventoryLine({
          sessionId: session.id,
          barcode: barcode.trim(),
          quantityCounted: qty,
        });
        setMessage("Ligne mise en file hors ligne — sync à la reconnexion");
        setBarcode("");
        setQuantity("1");
        return;
      }
      const res = await fetch(`/api/admin/inventory/sessions/${session.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: barcode.trim(), quantityCounted: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur ligne");
      lastLineIdRef.current = data.line.id;
      setMessage(
        data.line.product
          ? `Compté : ${data.line.product.name} × ${qty}`
          : `Code ${barcode} enregistré (non reconnu) × ${qty}`
      );
      setBarcode("");
      setQuantity("1");
      await refreshSession(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!session) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (lastLineIdRef.current) form.set("lineId", lastLineIdRef.current);
      const res = await fetch(`/api/admin/inventory/sessions/${session.id}/photos`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur photo");
      setMessage(
        data.drive?.uploaded
          ? "Photo enregistrée + Drive"
          : `Photo locale OK (${data.drive?.message || "Drive non configuré"})`
      );
      await refreshSession(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur photo");
    } finally {
      setLoading(false);
    }
  }

  async function completeSession() {
    if (!session) return;
    const ok = window.confirm(
      `Clôturer l'inventaire ${session.location.name} et appliquer les quantités sur cette boutique uniquement ?`
    );
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/inventory/sessions/${session.id}/complete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur clôture");
      setMessage(
        `Clôturé — ${data.applied} lignes appliquées` +
          (data.sheets?.synced ? " · Sheets sync OK" : ` · Sheets: ${data.sheets?.message || "off"}`)
      );
      setSession(null);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div
        className={`rounded-lg px-3 py-2 text-sm ${
          online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
        }`}
      >
        {online ? "En ligne" : "Hors ligne — les scans sont mis en file d’attente"}
      </div>

      {!session ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Nom employé</span>
            <Input
              className="mt-1"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Prénom Nom"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Boutique</span>
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value as StoreCode)}
            >
              <option value="HAUTMONT">All Vap&apos;s Hautmont</option>
              <option value="LE_QUESNOY">All Vap&apos;s Le Quesnoy</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={() => void startSession()}
            loading={loading}
            disabled={!employeeName.trim()}
          >
            Démarrer l&apos;inventaire
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
            <p className="font-semibold text-brand-900">
              {session.employeeName} · {session.location.name}
            </p>
            <p className="text-brand-800">Session {session.id.slice(0, 8)}… · {session.status}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Scan / code-barres</span>
              <Input
                className="mt-1"
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setLookupHint(null);
                }}
                onBlur={() => {
                  if (barcode.trim().length >= 6) void lookupBarcode(barcode.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addLine();
                }}
                placeholder="Scanner ou saisir l’EAN"
                autoFocus
              />
            </label>
            {lookupHint && (
              <p className="text-sm text-gray-600">{lookupHint}</p>
            )}
            <label className="block text-sm">
              <span className="font-medium">Quantité comptée</span>
              <Input
                className="mt-1 w-28"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void addLine()} loading={loading}>
                Enregistrer la ligne
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                loading={loading}
              >
                Photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPhoto(f);
                }}
              />
              <Button type="button" variant="secondary" onClick={() => void completeSession()} loading={loading}>
                Clôturer &amp; appliquer
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2">Qté</th>
                  <th className="px-3 py-2">Photo</th>
                </tr>
              </thead>
              <tbody>
                {(session.lines || []).map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="px-3 py-2">{l.barcode || "—"}</td>
                    <td className="px-3 py-2">{l.product?.name || "Non reconnu"}</td>
                    <td className="px-3 py-2">{l.quantityCounted}</td>
                    <td className="px-3 py-2">{l.photoPath ? "Oui" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Inventaires enregistrés
          </h2>
          <button
            type="button"
            onClick={() => void loadSessions()}
            className="text-sm text-brand-700 underline"
          >
            Rafraîchir
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Chaque ligne comptée : produit, code-barres, quantité, prix unitaire, valeur
          totale, photo, employé, boutique, date et heure.
        </p>

        {sessions.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
            Aucun inventaire enregistré pour l&apos;instant.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {sessions.map((s) => (
              <section
                key={s.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {s.employeeName}
                      <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                        {s.location.name}
                      </span>
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : s.status === "CANCELLED"
                              ? "bg-gray-200 text-gray-700"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {s.status}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDateTime(s.startedAt)} · {s._count?.lines ?? s.lines?.length ?? 0} ligne(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Valeur totale comptée</p>
                    <p className="font-semibold text-gray-900">
                      {formatCents(sessionTotalCents(s))}
                    </p>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b bg-white text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2">Photo</th>
                        <th className="px-3 py-2">Produit</th>
                        <th className="px-3 py-2">Code-barres</th>
                        <th className="px-3 py-2 text-right">Qté</th>
                        <th className="px-3 py-2 text-right">Prix unitaire</th>
                        <th className="px-3 py-2 text-right">Valeur totale</th>
                        <th className="px-3 py-2">Employé</th>
                        <th className="px-3 py-2">Boutique</th>
                        <th className="px-3 py-2">Date &amp; heure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.lines || []).length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-4 text-center text-gray-400">
                            Aucune ligne comptée
                          </td>
                        </tr>
                      ) : (
                        (s.lines || []).map((l) => {
                          const unit = unitPriceCents(l);
                          const total = unit == null ? null : unit * l.quantityCounted;
                          return (
                            <tr key={l.id} className="border-b last:border-0 align-middle">
                              <td className="px-3 py-2">
                                {l.photoPath ? (
                                  <a href={l.photoPath} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={l.photoPath}
                                      alt="Photo inventaire"
                                      className="h-12 w-12 rounded-md border border-gray-200 object-cover"
                                    />
                                  </a>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-900">
                                {l.product?.name || (
                                  <span className="font-normal text-gray-400">Non reconnu</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-700">
                                {l.barcode || l.product?.barcode || "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {l.quantityCounted}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatCents(unit)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                {formatCents(total)}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{s.employeeName}</td>
                              <td className="px-3 py-2 text-gray-700">{s.location.name}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {formatDateTime(l.createdAt)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
