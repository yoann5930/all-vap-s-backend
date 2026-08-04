"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  flushOfflineInventoryQueue,
  queueOfflineInventoryLine,
} from "@/lib/inventory/offline-queue";

type StoreCode = "HAUTMONT" | "LE_QUESNOY";

interface Session {
  id: string;
  employeeName: string;
  status: string;
  location: { code: string; name: string };
  lines?: Array<{
    id: string;
    barcode: string | null;
    quantityCounted: number;
    product?: { name: string } | null;
    photoPath?: string | null;
    notes?: string | null;
    createdAt?: string;
  }>;
}

const STORES: { code: StoreCode; label: string }[] = [
  { code: "HAUTMONT", label: "All Vap's Hautmont" },
  { code: "LE_QUESNOY", label: "All Vap's Le Quesnoy" },
];

export function EmployeeInventoryApp() {
  const [employeeName, setEmployeeName] = useState("");
  const [locationCode, setLocationCode] = useState<StoreCode | "">("");
  const [session, setSession] = useState<Session | null>(null);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirmStoreChange, setConfirmStoreChange] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastLineIdRef = useRef<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const refreshSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/inventaire/sessions/${id}/lines`);
    if (!res.ok) return;
    const data = await res.json();
    setSession(data.session);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void flushOfflineInventoryQueue("/api/inventaire/sessions");
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function lookupBarcode(code: string) {
    try {
      const res = await fetch(`/api/inventaire/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) return;
      if (data.found) {
        setLookupHint(
          `${data.product.name} — stock boutique actuel : ${
            locationCode === "LE_QUESNOY"
              ? data.product.stockLeQuesnoy
              : data.product.stockHautmont
          }`
        );
      } else {
        setLookupHint("Produit non reconnu — ligne enregistrée quand même");
      }
    } catch {
      setLookupHint(null);
    }
  }

  async function startSession() {
    if (!employeeName.trim() || !locationCode) {
      setError("Indiquez votre nom et la boutique.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventaire/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: employeeName.trim(), locationCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de démarrer");
      setSession(data.session);
      setMessage(`Inventaire démarré — ${data.session.location.name}`);
      setTimeout(() => barcodeRef.current?.focus(), 100);
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
        setMessage("Hors ligne — ligne mise en file, sync au retour réseau");
        setBarcode("");
        setQuantity("1");
        return;
      }
      const res = await fetch(`/api/inventaire/sessions/${session.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: barcode.trim(), quantityCounted: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur ligne");
      lastLineIdRef.current = data.line.id;
      const when = new Date().toLocaleString("fr-FR");
      setMessage(
        data.line.product
          ? `${data.line.product.name} × ${qty} — ${when}`
          : `Code ${barcode} × ${qty} — ${when}`
      );
      setBarcode("");
      setQuantity("1");
      setLookupHint(null);
      await refreshSession(session.id);
      barcodeRef.current?.focus();
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
      const res = await fetch(`/api/inventaire/sessions/${session.id}/photos`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur photo");
      setMessage(
        data.drive?.uploaded
          ? "Photo enregistrée (+ Drive)"
          : "Photo enregistrée localement"
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
      `Valider l'inventaire ${session.location.name} ?\nLes quantités seront appliquées uniquement à cette boutique.`
    );
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventaire/sessions/${session.id}/complete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur clôture");
      setMessage(`Terminé — ${data.applied} produit(s) mis à jour`);
      setSession(null);
      setLocationCode("");
      setEmployeeName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function requestStoreChange(code: StoreCode) {
    if (session && session.status === "OPEN" && code !== locationCode) {
      setConfirmStoreChange(true);
      return;
    }
    setLocationCode(code);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 py-6 text-gray-900">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          All Vap&apos;s
        </p>
        <h1 className="mt-1 text-2xl font-bold">Inventaire boutique</h1>
        <p
          className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          {online ? "En ligne" : "Hors ligne — file d’attente active"}
        </p>
      </header>

      {!session ? (
        <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="text-sm font-medium">Nom de l&apos;employé</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Prénom Nom"
              autoComplete="name"
              autoFocus
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">Boutique de l&apos;inventaire</legend>
            <div className="mt-2 space-y-2">
              {STORES.map((s) => (
                <label
                  key={s.code}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 ${
                    locationCode === s.code
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="store"
                    checked={locationCode === s.code}
                    onChange={() => requestStoreChange(s.code)}
                  />
                  <span className="font-medium">{s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            disabled={loading || !employeeName.trim() || !locationCode}
            onClick={() => void startSession()}
            className="w-full rounded-xl bg-emerald-700 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Démarrage…" : "Commencer l'inventaire"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-950">
              {session.employeeName} · {session.location.name}
            </p>
            <p className="mt-1 text-emerald-800">
              {new Date().toLocaleDateString("fr-FR")} · session ouverte
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
            <label className="block">
              <span className="text-sm font-medium">Scan / code-barres</span>
              <input
                ref={barcodeRef}
                className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
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
                inputMode="numeric"
                placeholder="Scanner ou saisir l’EAN"
              />
            </label>
            {lookupHint && <p className="text-sm text-gray-600">{lookupHint}</p>}

            <label className="block">
              <span className="text-sm font-medium">Quantité comptée</span>
              <input
                type="number"
                min={0}
                className="mt-1.5 w-28 rounded-xl border border-gray-300 px-3 py-3 text-base"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void addLine()}
                className="rounded-xl bg-emerald-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold disabled:opacity-50"
              >
                Photo
              </button>
            </div>
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
            <button
              type="button"
              disabled={loading}
              onClick={() => void completeSession()}
              className="w-full rounded-xl border border-emerald-700 px-3 py-3 text-sm font-semibold text-emerald-800"
            >
              Valider les comptages
            </button>
          </div>

          <ul className="space-y-2">
            {(session.lines || []).map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {l.product?.name || l.barcode || "Ligne"} × {l.quantityCounted}
                </div>
                <div className="text-xs text-gray-500">
                  {l.barcode || "—"}
                  {l.photoPath ? " · photo" : ""}
                  {l.createdAt
                    ? ` · ${new Date(l.createdAt).toLocaleTimeString("fr-FR")}`
                    : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmStoreChange && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4">
            <p className="font-semibold">Changer de boutique ?</p>
            <p className="mt-2 text-sm text-gray-600">
              Une session est en cours. Clôturez-la avant de changer de boutique.
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white"
              onClick={() => setConfirmStoreChange(false)}
            >
              Compris
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <p className="mt-8 text-center text-xs text-gray-400">
        Accès employé uniquement ·{" "}
        <a href="/login" className="underline">
          Administration
        </a>
      </p>
    </div>
  );
}
