"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flushOfflineInventoryQueue,
  queueOfflineInventoryLine,
} from "@/lib/inventory/offline-queue";
import { BarcodeCameraScanner } from "@/components/inventory/BarcodeCameraScanner";
import { formatEuroFromCents } from "@/lib/inventory/pricing";

type StoreCode = "HAUTMONT" | "LE_QUESNOY";

interface MeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  mustChangePassword?: boolean;
  allowedStores?: string[];
  active?: boolean;
}

interface SessionLine {
  id: string;
  barcode: string | null;
  quantityCounted: number;
  unitPriceCents?: number | null;
  totalValueCents?: number | null;
  priceSource?: string | null;
  productNameSnapshot?: string | null;
  product?: { name: string } | null;
  photoPath?: string | null;
  photos?: Array<{ publicUrl: string }>;
  notes?: string | null;
  createdAt?: string;
  scannedAt?: string;
}

interface Session {
  id: string;
  employeeName: string;
  status: string;
  location: { code: string; name: string };
  lines?: SessionLine[];
}

type LookupState = {
  found: boolean;
  name?: string;
  brand?: string;
  unitPriceCents?: number | null;
  priceSource?: string | null;
  priceMissing: boolean;
  priceLocked: boolean;
  imageUrl?: string | null;
};

const STORE_LABELS: Record<StoreCode, string> = {
  HAUTMONT: "All Vap's Hautmont",
  LE_QUESNOY: "All Vap's Le Quesnoy",
};

export function EmployeeInventoryApp() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [locationCode, setLocationCode] = useState<StoreCode | "">("");
  const [session, setSession] = useState<Session | null>(null);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirmStoreChange, setConfirmStoreChange] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastLineIdRef = useRef<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  function rememberLineId(id: string | null) {
    lastLineIdRef.current = id;
    try {
      if (id) sessionStorage.setItem("allvaps_last_inventory_line", id);
      else sessionStorage.removeItem("allvaps_last_inventory_line");
    } catch {
      /* ignore */
    }
  }

  function restoreLineId() {
    try {
      const saved = sessionStorage.getItem("allvaps_last_inventory_line");
      if (saved) lastLineIdRef.current = saved;
    } catch {
      /* ignore */
    }
  }

  const allowedStores = useMemo(() => {
    const stores = (me?.allowedStores || []) as StoreCode[];
    if (me?.role === "ADMIN") return ["HAUTMONT", "LE_QUESNOY"] as StoreCode[];
    return stores.filter((s) => s === "HAUTMONT" || s === "LE_QUESNOY");
  }, [me]);

  const displayName = useMemo(() => {
    if (!me) return "";
    return [me.firstName, me.lastName].filter(Boolean).join(" ").trim() || me.email;
  }, [me]);

  const refreshSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/inventaire/sessions/${id}/lines`);
    if (!res.ok) return;
    const data = await res.json();
    setSession(data.session);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.replace("/login?next=/inventaire");
          return;
        }
        const data = await res.json();
        const user = data.user as MeUser | undefined;
        if (!user || (user.role !== "EMPLOYEE" && user.role !== "ADMIN")) {
          router.replace("/login?next=/inventaire");
          return;
        }
        if (user.mustChangePassword) {
          router.replace("/changer-mot-de-passe?next=/inventaire");
          return;
        }
        if (!cancelled) setMe(user);
      } catch {
        router.replace("/login?next=/inventaire");
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    restoreLineId();
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
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function lookupBarcode(code: string) {
    try {
      const res = await fetch(`/api/inventaire/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) return;
      if (data.found) {
        const cents = data.price?.unitPriceCents as number | undefined;
        const missing = Boolean(data.priceMissing) || cents == null || cents <= 0;
        setLookup({
          found: true,
          name: data.product.name,
          brand: data.product.brand,
          unitPriceCents: missing ? null : cents,
          priceSource: data.price?.source || null,
          priceMissing: missing,
          priceLocked: !missing && me?.role !== "ADMIN",
          imageUrl: data.product.imageUrl,
        });
        setUnitPrice(missing ? "" : ((cents || 0) / 100).toFixed(2).replace(".", ","));
        setLookupHint(
          `${data.product.name}${data.product.brand ? ` · ${data.product.brand}` : ""} — stock : ${
            locationCode === "LE_QUESNOY"
              ? data.product.stockLeQuesnoy
              : data.product.stockHautmont
          }`
        );
      } else {
        setLookup({
          found: false,
          priceMissing: true,
          priceLocked: false,
          unitPriceCents: null,
        });
        setUnitPrice("");
        setLookupHint("Produit non reconnu — saisissez le prix manuellement");
      }
    } catch {
      setLookupHint(null);
    }
  }

  async function startSession() {
    if (!locationCode) {
      setError("Choisissez la boutique.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventaire/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de démarrer");
      setSession(data.session);
      rememberLineId(null);
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
    if (!unitPrice.trim()) {
      setError("Prix manquant — saisissez le prix unitaire (ex. 6,90)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        if (!unitPrice.trim()) {
          setError("Prix manquant — requis aussi hors ligne");
          setLoading(false);
          return;
        }
        await queueOfflineInventoryLine({
          sessionId: session.id,
          barcode: barcode.trim(),
          quantityCounted: qty,
          unitPrice: unitPrice.trim(),
          confirmZeroPrice: confirmZero,
        });
        setMessage("Hors ligne — ligne mise en file, sync au retour réseau");
        setBarcode("");
        setQuantity("1");
        setUnitPrice("");
        setLookup(null);
        setConfirmZero(false);
        return;
      }

      const payload: Record<string, unknown> = {
        barcode: barcode.trim(),
        quantityCounted: qty,
        confirmZeroPrice: confirmZero,
      };
      if (lookup?.priceLocked && lookup.unitPriceCents != null) {
        payload.unitPriceCents = lookup.unitPriceCents;
        payload.priceSource = lookup.priceSource || "CATALOGUE";
      } else {
        payload.unitPrice = unitPrice.trim();
        if (lookup?.priceSource) payload.priceSource = lookup.priceSource;
      }

      const res = await fetch(`/api/inventaire/sessions/${session.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur ligne");
      rememberLineId(data.line.id);
      const when = new Date().toLocaleString("fr-FR");
      const name = data.line.productNameSnapshot || data.line.product?.name || barcode;
      setMessage(
        `${name} × ${qty} · ${formatEuroFromCents(data.line.unitPriceCents)} — ${when}`
      );
      setBarcode("");
      setQuantity("1");
      setUnitPrice("");
      setLookup(null);
      setLookupHint(null);
      setConfirmZero(false);
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
    restoreLineId();
    let lineId = lastLineIdRef.current;
    if (!lineId && session.lines?.length) {
      lineId = session.lines[0].id;
      rememberLineId(lineId);
    }
    if (!lineId) {
      setError("Enregistrez d’abord la ligne (quantité + prix) avant la photo");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("lineId", lineId);
      const res = await fetch(`/api/inventaire/sessions/${session.id}/photos`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur photo");
      setMessage(
        data.persistent === false
          ? "Photo enregistrée (stockage temporaire — configurer Blob en prod)"
          : data.drive?.uploaded
            ? "Photo enregistrée (+ Drive)"
            : "Photo enregistrée"
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
      `Terminer l'inventaire ${session.location.name} ?\nLes quantités seront appliquées à cette boutique.\nLa validation définitive reste réservée à Yoann.`
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const onBarcodeScanned = useCallback(
    (code: string) => {
      const cleaned = code.trim();
      if (!cleaned) return;
      setBarcode(cleaned);
      setMessage(`Code scanné : ${cleaned}`);
      setError(null);
      void lookupBarcode(cleaned);
      setTimeout(() => barcodeRef.current?.focus(), 50);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationCode, me?.role]
  );

  function requestStoreChange(code: StoreCode) {
    if (session && session.status === "OPEN" && code !== locationCode) {
      setConfirmStoreChange(true);
      return;
    }
    setLocationCode(code);
  }

  if (authLoading) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-4">
        <p className="text-sm text-gray-600">Vérification de la session…</p>
      </div>
    );
  }

  if (!me) return null;

  const priceReadOnly = Boolean(lookup?.priceLocked);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 py-6 text-gray-900">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            All Vap&apos;s
          </p>
          <h1 className="mt-1 text-2xl font-bold">Inventaire boutique</h1>
          <p className="mt-1 text-sm text-gray-600">{displayName}</p>
          <p
            className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {online ? "En ligne" : "Hors ligne — file d’attente active"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold"
        >
          Déconnexion
        </button>
      </header>

      {!session ? (
        <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <fieldset>
            <legend className="text-sm font-medium">Boutique de l&apos;inventaire</legend>
            <div className="mt-2 space-y-2">
              {allowedStores.map((code) => (
                <label
                  key={code}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 ${
                    locationCode === code
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="store"
                    checked={locationCode === code}
                    onChange={() => requestStoreChange(code)}
                  />
                  <span className="font-medium">{STORE_LABELS[code]}</span>
                </label>
              ))}
              {allowedStores.length === 0 && (
                <p className="text-sm text-red-600">
                  Aucune boutique autorisée — contactez Yoann.
                </p>
              )}
            </div>
          </fieldset>

          <button
            type="button"
            disabled={loading || !locationCode}
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
              <div className="mt-1.5 flex gap-2">
                <input
                  ref={barcodeRef}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    setLookupHint(null);
                    setLookup(null);
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
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setScannerOpen(true)}
                  className="shrink-0 rounded-xl bg-gray-900 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  aria-label="Scanner avec l’appareil photo"
                >
                  Caméra
                </button>
              </div>
            </label>
            {lookupHint && <p className="text-sm text-gray-600">{lookupHint}</p>}
            {lookup?.priceMissing && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Prix manquant — saisie obligatoire avant enregistrement
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Quantité</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Prix unitaire (€)</span>
                <input
                  inputMode="decimal"
                  className={`mt-1.5 w-full rounded-xl border px-3 py-3 text-base ${
                    lookup?.priceMissing
                      ? "border-amber-400 bg-amber-50"
                      : "border-gray-300"
                  } ${priceReadOnly ? "bg-gray-50 text-gray-700" : ""}`}
                  value={unitPrice}
                  readOnly={priceReadOnly}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="ex. 6,90"
                />
              </label>
            </div>
            {lookup && !lookup.priceMissing && (
              <p className="text-xs text-gray-500">
                Prix {lookup.priceSource || "catalogue"}
                {priceReadOnly ? " (verrouillé)" : ""}
              </p>
            )}
            {unitPrice.trim() === "0" || unitPrice.trim() === "0,00" || unitPrice.trim() === "0.00" ? (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={confirmZero}
                  onChange={(e) => setConfirmZero(e.target.checked)}
                />
                Confirmer un prix à 0,00 €
              </label>
            ) : null}

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
              Terminer l&apos;inventaire
            </button>
          </div>

          <ul className="space-y-2">
            {(session.lines || []).map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {l.productNameSnapshot || l.product?.name || l.barcode || "Ligne"} ×{" "}
                  {l.quantityCounted}
                </div>
                <div className="text-xs text-gray-500">
                  {l.barcode || "—"}
                  {l.unitPriceCents != null
                    ? ` · ${formatEuroFromCents(l.unitPriceCents)}`
                    : " · prix ?"}
                  {l.totalValueCents != null
                    ? ` · total ${formatEuroFromCents(l.totalValueCents)}`
                    : ""}
                  {l.photoPath || (l.photos && l.photos.length > 0) ? " · photo" : ""}
                  {l.scannedAt || l.createdAt
                    ? ` · ${new Date(l.scannedAt || l.createdAt!).toLocaleTimeString("fr-FR")}`
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

      <BarcodeCameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={onBarcodeScanned}
      />
    </div>
  );
}
