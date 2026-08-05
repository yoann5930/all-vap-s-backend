"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushOfflineInventoryQueue } from "@/lib/inventory/offline-queue";
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
  brandSnapshot?: string | null;
  rangeSnapshot?: string | null;
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
  range?: string;
  unitPriceCents?: number | null;
  priceSource?: string | null;
  priceMissing: boolean;
  priceLocked: boolean;
  priceFromRange?: boolean;
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
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [rangeName, setRangeName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [applyToRange, setApplyToRange] = useState(true);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
  const sessionRef = useRef<Session | null>(null);
  const meRef = useRef<MeUser | null>(null);
  const locationCodeRef = useRef<StoreCode | "">("");
  const scanBusyRef = useRef(false);

  sessionRef.current = session;
  meRef.current = me;
  locationCodeRef.current = locationCode;

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

  function clearDraftLine() {
    setBarcode("");
    setProductName("");
    setBrandName("");
    setRangeName("");
    setQuantity("1");
    setUnitPrice("");
    setLookup(null);
    setLookupHint(null);
    setConfirmZero(false);
    setPendingPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
  }

  function setPhotoFile(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPendingPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function lookupBarcode(code: string) {
    try {
      const res = await fetch(`/api/inventaire/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) return;
      if (data.found) {
        const cents = data.price?.unitPriceCents as number | undefined;
        const missing = Boolean(data.priceMissing) || cents == null || cents <= 0;
        setProductName(data.product.name || "");
        setBrandName(data.product.brand || "");
        setRangeName(data.product.range || "");
        setLookup({
          found: true,
          name: data.product.name,
          brand: data.product.brand,
          range: data.product.range,
          unitPriceCents: missing ? null : cents,
          priceSource: data.price?.source || null,
          priceMissing: missing,
          priceLocked: !missing && me?.role !== "ADMIN" && data.price?.source !== "GAMME",
          priceFromRange: Boolean(data.priceFromRange),
          imageUrl: data.product.imageUrl,
        });
        setUnitPrice(missing ? "" : ((cents || 0) / 100).toFixed(2).replace(".", ","));
        setLookupHint(
          `${data.product.name}${data.product.brand ? ` · ${data.product.brand}` : ""}${
            data.product.range ? ` · gamme ${data.product.range}` : ""
          }${data.priceFromRange ? " · prix gamme" : ""} — stock : ${
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
        setProductName("");
        setBrandName("");
        setRangeName("");
        setLookupHint(
          "Produit non reconnu — saisissez nom, gamme, prix et photo avant enregistrement"
        );
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
    const code = barcode.trim();
    if (code.length < 6) {
      setError("Code-barres obligatoire");
      return;
    }
    if (!productName.trim()) {
      setError("Nom du produit obligatoire");
      return;
    }
    if (!rangeName.trim()) {
      setError("Gamme obligatoire");
      return;
    }
    if (isNaN(qty) || qty < 0) {
      setError("Quantité invalide");
      return;
    }
    if (!unitPrice.trim()) {
      setError("Prix manquant — saisissez le tarif avant enregistrement");
      return;
    }
    if (!pendingPhoto) {
      setError("Photo produit obligatoire avant enregistrement");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        setError("Connexion requise pour enregistrer (code-barres + prix + photo)");
        setLoading(false);
        return;
      }

      const payload: Record<string, unknown> = {
        barcode: code,
        productName: productName.trim(),
        brand: brandName.trim() || undefined,
        range: rangeName.trim(),
        quantityCounted: qty,
        confirmZeroPrice: confirmZero,
        photoConfirmed: true,
        applyToRange: applyToRange && Boolean(rangeName.trim()),
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

      const lineId = data.line.id as string;
      rememberLineId(lineId);

      const form = new FormData();
      form.set("file", pendingPhoto);
      form.set("lineId", lineId);
      const photoRes = await fetch(`/api/inventaire/sessions/${session.id}/photos`, {
        method: "POST",
        body: form,
      });
      const photoData = await photoRes.json().catch(() => ({}));
      if (!photoRes.ok) {
        throw new Error(
          photoData.error ||
            "Ligne créée mais photo refusée — ajoutez la photo depuis la liste ou recommencez"
        );
      }

      const when = new Date().toLocaleString("fr-FR");
      const name = data.line.productNameSnapshot || productName;
      const rangeNote =
        data.meta?.rangePriceApplied > 0
          ? ` · prix appliqué à ${data.meta.rangePriceApplied} produit(s) de la gamme`
          : "";
      setMessage(
        `${name} × ${qty} · ${formatEuroFromCents(data.line.unitPriceCents)} — ${when}${rangeNote}`
      );
      clearDraftLine();
      await refreshSession(session.id);
      barcodeRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhoto(file: File) {
    // Photo liée à la saisie en cours (obligatoire avant Enregistrer)
    setPhotoFile(file);
    setMessage("Photo prête — vérifiez nom / gamme / prix puis Enregistrer");
    setError(null);
  }

  async function completeSession() {
    if (!session) return;
    const ok = window.confirm(
      `Terminer l'inventaire ${session.location.name} ?\nChaque ligne doit avoir code-barres + prix + photo.\nLes quantités seront appliquées à cette boutique.`
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
      clearDraftLine();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Scan caméra : remplit code-barres + fiche (nom/gamme/prix).
   * N’enregistre PAS sans photo — ferme le scan pour prise de photo produit.
   */
  const onBarcodeScanned = useCallback(async (code: string): Promise<boolean | void> => {
    const cleaned = code.trim();
    if (!cleaned || scanBusyRef.current) return;
    scanBusyRef.current = true;
    setBarcode(cleaned);
    setError(null);
    setMessage(`Code détecté : ${cleaned} — complétez photo + tarif puis Enregistrer`);
    try {
      await lookupBarcode(cleaned);
    } finally {
      scanBusyRef.current = false;
    }
    return false; // pause caméra → saisie photo / validation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationCode, me?.role]);

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
              <span className="text-sm font-medium">Scan / code-barres *</span>
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
                  inputMode="numeric"
                  placeholder="Scanner ou saisir l’EAN"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setScannerOpen(true)}
                  className="shrink-0 rounded-xl bg-emerald-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  aria-label="Scan automatique à la caméra"
                >
                  Scan auto
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Scan auto détecte le code. Enregistrement seulement avec nom + gamme + prix + photo.
              </p>
            </label>
            {lookupHint && <p className="text-sm text-gray-600">{lookupHint}</p>}
            {lookup?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lookup.imageUrl}
                alt=""
                className="h-20 w-20 rounded-lg object-cover ring-1 ring-gray-200"
              />
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Nom produit *</span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Nom affiché sur la photo / emballage"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium">Marque</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Marque"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Gamme *</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                    value={rangeName}
                    onChange={(e) => setRangeName(e.target.value)}
                    placeholder="Gamme"
                  />
                </label>
              </div>
            </div>

            {lookup?.priceMissing && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Prix manquant — saisie obligatoire. Ce tarif pourra s’appliquer à toute la gamme.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Quantité *</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Prix unitaire (€) *</span>
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
                {lookup.priceFromRange ? " (gamme)" : ""}
                {priceReadOnly ? " (verrouillé)" : ""}
              </p>
            )}
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={applyToRange}
                onChange={(e) => setApplyToRange(e.target.checked)}
              />
              <span>
                Appliquer ce prix à <strong>toute la gamme</strong>
                {rangeName ? ` « ${rangeName} »` : ""} (tous les produits de la gamme)
              </span>
            </label>
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

            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-800">Photo produit *</p>
              <p className="mt-1 text-xs text-gray-500">
                Photo obligatoire : le produit doit permettre de vérifier nom, gamme et prix.
              </p>
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Aperçu"
                  className="mt-2 h-28 w-28 rounded-lg object-cover ring-1 ring-gray-200"
                />
              ) : (
                <p className="mt-2 text-xs font-semibold text-amber-800">Aucune photo — enregistrement bloqué</p>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => fileRef.current?.click()}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {pendingPhoto ? "Changer la photo" : "Prendre / choisir la photo"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={
                  loading ||
                  barcode.trim().length < 6 ||
                  !productName.trim() ||
                  !rangeName.trim() ||
                  !unitPrice.trim() ||
                  !pendingPhoto
                }
                onClick={() => void addLine()}
                className="rounded-xl bg-emerald-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer (code + prix + photo)
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = "";
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
                  {l.productNameSnapshot || l.product?.name || "Sans nom"} ×{" "}
                  {l.quantityCounted}
                </div>
                <div className="text-xs text-gray-500">
                  EAN {l.barcode || "—"}
                  {l.rangeSnapshot ? ` · gamme ${l.rangeSnapshot}` : ""}
                  {l.unitPriceCents != null
                    ? ` · ${formatEuroFromCents(l.unitPriceCents)}`
                    : " · prix ?"}
                  {l.totalValueCents != null
                    ? ` · total ${formatEuroFromCents(l.totalValueCents)}`
                    : ""}
                  {l.photoPath || (l.photos && l.photos.length > 0) ? " · photo ✓" : " · photo ✗"}
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
        continuous
        onClose={() => setScannerOpen(false)}
        onDetected={onBarcodeScanned}
      />
    </div>
  );
}
