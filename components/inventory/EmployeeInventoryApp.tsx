"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushOfflineInventoryQueue } from "@/lib/inventory/offline-queue";
import { BarcodeCameraScanner } from "@/components/inventory/BarcodeCameraScanner";
import { VisualRecognitionCamera } from "@/components/inventory/VisualRecognitionCamera";
import { InventoryInstallButton } from "@/components/inventory/InventoryInstallButton";
import { formatEuroFromCents } from "@/lib/inventory/pricing";
import {
  buildVisualIndex,
  decideVisualAction,
  matchVisualCanvas,
  sharpenCatalogImageUrl,
  type VisualIndexedProduct,
  type VisualMatch,
} from "@/components/inventory/visual-product-matcher";

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
  const [productId, setProductId] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<
    Array<{
      id: string;
      name: string;
      brand?: string | null;
      range?: string | null;
      barcode?: string | null;
      imageUrl?: string | null;
      unitPriceCents?: number | null;
      unitPriceLabel?: string | null;
      source?: string;
      score?: number;
    }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    lineId: string;
    sessionId?: string;
    message: string;
    quantityCounted: number;
    reason?: "SAME_SESSION" | "SAME_DAY" | "WITHIN_MONTH";
  } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [applyToRange, setApplyToRange] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirmStoreChange, setConfirmStoreChange] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [visualSuggestions, setVisualSuggestions] = useState<VisualMatch[]>([]);
  const [visualReady, setVisualReady] = useState(false);
  const [recognitionHint, setRecognitionHint] = useState<string | null>(null);
  const lastLineIdRef = useRef<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const meRef = useRef<MeUser | null>(null);
  const locationCodeRef = useRef<StoreCode | "">("");
  const scanBusyRef = useRef(false);
  const nameLookupTimer = useRef<number | null>(null);
  const visualIndexRef = useRef<VisualIndexedProduct[]>([]);
  const visualLoadPromiseRef = useRef<Promise<void> | null>(null);
  const visualHashVersionRef = useRef(0);
  const ocrAvailableRef = useRef(false);
  const visualMatchBusyRef = useRef(false);
  const visualLookupBusyRef = useRef(false);
  const lastVisualAutoIdRef = useRef<string>("");
  const identifyBusyRef = useRef(false);
  const lastIdentifyAtRef = useRef(0);
  const lastIdentifyKeyRef = useRef<string>("");
  /** Cap identify Internet par session Photo (évite spam frame). */
  const identifyAttemptsRef = useRef(0);
  const identifyAbortRef = useRef<AbortController | null>(null);
  const localMissStreakRef = useRef(0);
  const lastCanvasIdentifyAtRef = useRef(0);
  const photoRecognizedRef = useRef(false);
  const visualSuggestionsRef = useRef<VisualMatch[]>([]);
  const MAX_IDENTIFY_PER_PHOTO = 3;
  const CANVAS_IDENTIFY_COOLDOWN_MS = 5500;
  const LOCAL_MISS_BEFORE_IDENTIFY = 3;

  type IdentifySuggestion = {
    name: string;
    brand: string | null;
    range: string | null;
    barcode: string | null;
    sku: string | null;
    source: string;
    confidence: number;
    localProductId: string | null;
    unitPriceCents: number | null;
    unitPriceLabel: string | null;
    imageUrl?: string | null;
    sumupProductId?: string | null;
  };

  function canvasToDataUrl(canvas: HTMLCanvasElement): string | null {
    try {
      return canvas.toDataURL("image/jpeg", 0.88);
    } catch {
      return null;
    }
  }

  function applyIdentifySuggestion(s: IdentifySuggestion) {
    setProductId(s.localProductId);
    setProductName(s.name || "");
    setBrandName(s.brand || "");
    setRangeName(s.range || "");
    if (s.barcode) setBarcode(s.barcode);
    const priceOk = s.unitPriceCents != null && s.unitPriceCents > 0;
    setLookup({
      found: true,
      name: s.name,
      brand: s.brand || undefined,
      range: s.range || undefined,
      unitPriceCents: priceOk ? s.unitPriceCents : null,
      priceSource: priceOk
        ? s.sumupProductId
          ? "SUMUP"
          : "CATALOGUE"
        : null,
      priceMissing: !priceOk,
      priceLocked: false,
      imageUrl: s.imageUrl || null,
    });
    setUnitPrice(
      priceOk ? ((s.unitPriceCents || 0) / 100).toFixed(2).replace(".", ",") : ""
    );
    setQuantity("");
    setShowSuggestions(false);
    visualSuggestionsRef.current = [];
    setVisualSuggestions([]);
    setLookupHint(
      `Identifié (${s.source}) : ${s.name}${s.brand ? ` · ${s.brand}` : ""}${
        s.range ? ` · ${s.range}` : ""
      }`
    );
    setMessage("Produit reconnu — saisissez uniquement la quantité");
    setRecognitionHint("Produit reconnu");
    setPhotoOpen(false);
    focusQuantityField();
  }

  async function identifyUnknownProduct(params: {
    barcode?: string | null;
    query?: string | null;
    canvas?: HTMLCanvasElement | null;
  }): Promise<boolean> {
    if (identifyBusyRef.current) return false;
    if (photoRecognizedRef.current) return false;
    if (visualSuggestionsRef.current.length > 0) return false;

    const isCanvas = Boolean(params.canvas);
    if (isCanvas) {
      if (identifyAttemptsRef.current >= MAX_IDENTIFY_PER_PHOTO) {
        setRecognitionHint(
          "Recherche limitée — saisissez le nom ou scannez l’EAN"
        );
        return false;
      }
      const nowCd = Date.now();
      if (nowCd - lastCanvasIdentifyAtRef.current < CANVAS_IDENTIFY_COOLDOWN_MS) {
        return false;
      }
    }

    const key = `${params.barcode || ""}|${params.query || ""}|${isCanvas ? "img" : ""}`;
    const now = Date.now();
    if (
      key === lastIdentifyKeyRef.current &&
      now - lastIdentifyAtRef.current < (isCanvas ? 5000 : 2500)
    ) {
      return false;
    }

    identifyBusyRef.current = true;
    lastIdentifyKeyRef.current = key;
    lastIdentifyAtRef.current = now;

    identifyAbortRef.current?.abort();
    const abort = new AbortController();
    identifyAbortRef.current = abort;

    setRecognitionHint("Recherche du produit…");
    try {
      const payload: Record<string, string> = {};
      if (params.barcode) payload.barcode = params.barcode;
      if (params.query) payload.query = params.query;
      if (params.canvas) {
        // Sans OCR Internet, l’image seule ne sert à rien
        if (!ocrAvailableRef.current && !params.barcode && !params.query) {
          setRecognitionHint(
            "OCR indisponible — choisissez une suggestion, scannez l’EAN ou saisissez le nom"
          );
          return false;
        }
        const dataUrl = canvasToDataUrl(params.canvas);
        if (dataUrl && dataUrl.length < 900_000) payload.imageDataUrl = dataUrl;
        if (!payload.imageDataUrl && !payload.barcode && !payload.query) {
          return false;
        }
      }
      // Compte uniquement les appels réellement envoyés
      if (isCanvas) {
        identifyAttemptsRef.current += 1;
        lastCanvasIdentifyAtRef.current = Date.now();
      }
      const res = await fetch("/api/inventaire/product-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return false;
      const data = await res.json();
      if (!res.ok) {
        setRecognitionHint(
          data.error || "Recherche indisponible — saisie manuelle possible"
        );
        return false;
      }

      if (process.env.NODE_ENV === "development" && data.diagnostics) {
        console.info("[inventaire:identify]", data.diagnostics);
      }

      const list = (data.suggestions || []) as IdentifySuggestion[];
      if (data.autoFill && data.suggestion) {
        photoRecognizedRef.current = true;
        applyIdentifySuggestion(data.suggestion as IdentifySuggestion);
        return true;
      }
      if (list.length === 1 && list[0].confidence >= 0.9) {
        photoRecognizedRef.current = true;
        applyIdentifySuggestion(list[0]);
        return true;
      }
      if (list.length > 1) {
        const mapped = list.map((s, i) => ({
          id: s.localProductId || `ext-${i}-${s.barcode || s.name}`,
          name: s.name,
          brand: s.brand,
          range: s.range,
          category: s.range,
          barcode: s.barcode,
          imageUrl: s.imageUrl || "",
          priceCents: s.unitPriceCents,
          score: s.confidence,
          distance: Math.round((1 - s.confidence) * 64),
          source: s.source,
        })) as VisualMatch[];
        visualSuggestionsRef.current = mapped;
        setVisualSuggestions(mapped);
        setRecognitionHint("Plusieurs résultats possibles — choisissez");
        setMessage(
          list
            .slice(0, 5)
            .map((s) => `${s.name} (${s.source}, ${Math.round(s.confidence * 100)}%)`)
            .join(" · ")
        );
        return false;
      }

      const reason =
        data.failureReason ||
        (data.ocrText
          ? `Texte détecté : « ${String(data.ocrText).slice(0, 60)} » — aucun produit fiable`
          : "Aucun produit fiable trouvé");
      setRecognitionHint(reason);
      setLookupHint(reason);
      return false;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      setRecognitionHint("Recherche indisponible — saisie manuelle possible");
      return false;
    } finally {
      identifyBusyRef.current = false;
    }
  }


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

  /** Après identification : quantité vide + focus (après fermeture éventuelle du scanner). */
  function focusQuantityField() {
    setQuantity("");
    window.setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    }, 320);
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
    setProductId(null);
    setNameSuggestions([]);
    setShowSuggestions(false);
    setDuplicateInfo(null);
    setQuantity("");
    setUnitPrice("");
    setLookup(null);
    setLookupHint(null);
    setConfirmZero(false);
    setVisualSuggestions([]);
    setRecognitionHint(null);
  }

  function applyMemoryProduct(data: {
    product?: {
      id?: string | null;
      name?: string | null;
      brand?: string | null;
      range?: string | null;
      category?: string | null;
      barcode?: string | null;
      imageUrl?: string | null;
      stockHautmont?: number;
      stockLeQuesnoy?: number;
    };
    price?: { unitPriceCents?: number; source?: string } | null;
    priceMissing?: boolean;
    priceFromRange?: boolean;
    matchedBy?: string;
  }) {
    const p = data.product;
    if (!p?.name) return;
    const cents = data.price?.unitPriceCents;
    const missing = Boolean(data.priceMissing) || cents == null || cents <= 0;
    setProductId(p.id || null);
    setProductName(p.name || "");
    setBrandName(p.brand || "");
    setRangeName(p.range || p.category || "Non classé");
    if (p.barcode) setBarcode(p.barcode);
    setLookup({
      found: true,
      name: p.name || undefined,
      brand: p.brand || undefined,
      range: p.range || undefined,
      unitPriceCents: missing ? null : cents,
      priceSource: data.price?.source || null,
      priceMissing: missing,
      priceLocked:
        !missing && me?.role !== "ADMIN" && data.price?.source !== "GAMME",
      priceFromRange: Boolean(data.priceFromRange),
      imageUrl: p.imageUrl,
    });
    setUnitPrice(missing ? "" : ((cents || 0) / 100).toFixed(2).replace(".", ","));
    setLookupHint(
      `Mémoire : ${p.name}${p.brand ? ` · ${p.brand}` : ""}${
        p.range ? ` · gamme ${p.range}` : p.category ? ` · ${p.category}` : ""
      }${p.barcode ? ` · EAN ${p.barcode}` : " · sans EAN"}${
        data.matchedBy ? ` (${data.matchedBy})` : ""
      }`
    );
    setShowSuggestions(false);
    setVisualSuggestions([]);
  }

  function applyDuplicateFromLookup(data: {
    duplicate?: {
      lineId?: string;
      sessionId?: string;
      message?: string;
      quantityCounted?: number;
      reason?: "SAME_SESSION" | "SAME_DAY" | "WITHIN_MONTH";
    } | null;
  }) {
    if (data.duplicate?.lineId && data.duplicate.message) {
      setDuplicateInfo({
        lineId: data.duplicate.lineId,
        sessionId: data.duplicate.sessionId,
        message: data.duplicate.message,
        quantityCounted: data.duplicate.quantityCounted || 0,
        reason: data.duplicate.reason,
      });
      setError(data.duplicate.message);
      rememberLineId(data.duplicate.lineId);
    } else {
      setDuplicateInfo(null);
    }
  }

  async function lookupBarcode(code: string): Promise<boolean> {
    try {
      const sid = sessionRef.current?.id;
      const qs = new URLSearchParams({ barcode: code });
      if (sid) qs.set("sessionId", sid);
      const res = await fetch(`/api/inventaire/lookup?${qs}`);
      const data = await res.json();
      if (!res.ok) return false;
      if (data.found && data.product?.name) {
        applyMemoryProduct(data);
        applyDuplicateFromLookup(data);
        focusQuantityField();
        return true;
      }
      setLookup({
        found: false,
        priceMissing: true,
        priceLocked: false,
        unitPriceCents: null,
      });
      setProductId(null);
      setUnitPrice("");
      setLookupHint(
        data.message ||
          "Code inconnu en mémoire — tapez le nom pour rechercher dans le catalogue"
      );
      setShowSuggestions(false);
      return false;
    } catch {
      setLookupHint(null);
      return false;
    }
  }

  /** Charge l’index visuel : catalogue boutique + référence sites officiels FR. */
  async function loadVisualCatalogIndex(force = false) {
    if (visualLoadPromiseRef.current) return visualLoadPromiseRef.current;
    // Index déjà prêt : ne pas recharger (sauf force) — évite frames Photo à vide
    if (!force && visualIndexRef.current.length > 0) {
      setVisualReady(true);
      return;
    }
    if (visualIndexRef.current.length === 0) {
      setVisualReady(false);
    }

    const run = (async () => {
    try {
      let list: unknown[] = [];
      const legacyRes = await fetch("/api/products?legacy=true");
      if (legacyRes.ok) {
        const data = await legacyRes.json();
        list = Array.isArray(data) ? data : data.products || [];
      } else {
        const pageRes = await fetch("/api/products?limit=48");
        if (pageRes.ok) {
          const data = await pageRes.json();
          list = data.products || [];
        }
      }

      const mapped = (list as Array<{
        id?: string;
        name?: string;
        brand?: string | null;
        range?: string | null;
        category?: string | null;
        barcode?: string | null;
        imageUrl?: string | null;
        priceCents?: number | null;
      }>)
        .map((p) => ({
          id: p.id || "",
          name: p.name || "",
          brand: p.brand,
          range: p.range,
          category: p.category,
          barcode: p.barcode,
          imageUrl: (p.imageUrl || "").trim(),
          priceCents: p.priceCents != null && p.priceCents > 0 ? p.priceCents : null,
        }))
        .filter(
          (p) =>
            p.id &&
            p.name &&
            p.imageUrl &&
            // Ignore placeholders Unsplash (inutiles pour reconnaître un e-liquide)
            !/unsplash\.com/i.test(p.imageUrl)
        );

      // Référence fabricants FR — hash précalculés (prioritaires) + proxy pour affichage
      try {
        const refRes = await fetch("/api/inventaire/visual-reference");
        if (refRes.ok) {
          const refData = await refRes.json();
          ocrAvailableRef.current = Boolean(refData.ocrAvailable);
          const apiVersion = Number(refData.version) || 0;
          // Nouvelle version de hash → remplacer l’index (pas garder l’ancien)
          if (
            apiVersion &&
            visualHashVersionRef.current &&
            apiVersion !== visualHashVersionRef.current
          ) {
            visualIndexRef.current = [];
          }
          visualHashVersionRef.current = apiVersion;
          const refs = (refData.products || []) as Array<{
            id: string;
            name: string;
            brand?: string | null;
            range?: string | null;
            category?: string | null;
            barcode?: string | null;
            imageUrl?: string | null;
            hash?: number[] | null;
            colorHist?: number[] | null;
            dHash?: number[] | null;
          }>;
          const preIndexed: VisualIndexedProduct[] = [];
          for (const r of refs) {
            if (!r.imageUrl || !r.name) continue;
            const sharp = sharpenCatalogImageUrl(r.imageUrl);
            const proxied = `/api/inventaire/image-proxy?url=${encodeURIComponent(sharp)}`;
            const base = {
              id: r.id,
              name: r.name,
              brand: r.brand || null,
              range: r.range || null,
              category: r.category || r.range || null,
              barcode: r.barcode || null,
              imageUrl: proxied,
              priceCents: null as number | null,
            };
            if (
              Array.isArray(r.hash) &&
              r.hash.length === 8 &&
              Array.isArray(r.colorHist) &&
              r.colorHist.length === 64
            ) {
              preIndexed.push({
                ...base,
                hash: Uint8Array.from(r.hash),
                colorHist: Uint8Array.from(r.colorHist),
                dHash:
                  Array.isArray(r.dHash) && r.dHash.length === 8
                    ? Uint8Array.from(r.dHash)
                    : undefined,
              });
            } else {
              mapped.push(base);
            }
          }
          if (preIndexed.length) {
            visualIndexRef.current = preIndexed;
            setVisualReady(true);
            setRecognitionHint(null);
            setLookupHint(
              `Mémoire visuelle : ${preIndexed.length} références prêtes`
            );
          }
        }
      } catch {
        /* référence optionnelle */
      }

      // Complète avec images catalogue boutique (hors Unsplash) si besoin
      const index = await buildVisualIndex(mapped, {
        maxProducts: 700,
        onProgress: (done, total) => {
          if (done === total || done % 25 === 0) {
            setRecognitionHint(`Mémoire visuelle boutique ${done}/${total}…`);
          }
        },
      });
      const merged = [...visualIndexRef.current, ...index];
      // dédup par id
      const seen = new Set<string>();
      const unique = merged.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      visualIndexRef.current = unique;
      setVisualReady(unique.length > 0);
      if (unique.length === 0) {
        setRecognitionHint(
          "Mémoire visuelle vide — scannez l’EAN ou saisissez le nom"
        );
      } else {
        setRecognitionHint(null);
        setLookupHint(`Mémoire visuelle : ${unique.length} produits prêts`);
      }
    } catch {
      if (visualIndexRef.current.length === 0) {
        setVisualReady(false);
      }
    } finally {
      visualLoadPromiseRef.current = null;
    }
    })();

    visualLoadPromiseRef.current = run;
    return run;
  }

  /** Remplit le formulaire depuis un produit reconnu (jamais la quantité, jamais un prix inventé). */
  async function applyVisualProduct(match: VisualMatch) {
    if (visualLookupBusyRef.current) return;
    visualLookupBusyRef.current = true;
    setRecognitionHint("Produit reconnu");
    try {
      const isRef =
        String(match.id).startsWith("ref-") ||
        (match.imageUrl || "").includes("/api/inventaire/image-proxy");

      if (isRef) {
        setProductId(null);
        setProductName(match.name || "");
        setBrandName(match.brand || "");
        setRangeName(match.range || match.category || "");
        if (match.barcode) setBarcode(match.barcode);
        setLookup({
          found: true,
          name: match.name,
          brand: match.brand || undefined,
          range: match.range || undefined,
          unitPriceCents: null,
          priceSource: null,
          priceMissing: true,
          priceLocked: false,
          imageUrl: match.imageUrl,
        });
        setUnitPrice("");
        setQuantity("");
        setShowSuggestions(false);
        visualSuggestionsRef.current = [];
        setVisualSuggestions([]);
        try {
          const qs = new URLSearchParams({ name: match.name });
          const sid = sessionRef.current?.id;
          if (sid) qs.set("sessionId", sid);
          const res = await fetch(`/api/inventaire/lookup?${qs}`);
          const data = await res.json();
          if (res.ok && data.found && data.product?.name) {
            applyMemoryProduct(data);
            applyDuplicateFromLookup(data);
            if (match.barcode) setBarcode(match.barcode);
            if (!(data.product.brand) && match.brand) setBrandName(match.brand);
            if (
              !(data.product.range || data.product.category) &&
              (match.range || match.category)
            ) {
              setRangeName(match.range || match.category || "");
            }
          }
        } catch {
          /* garder référence */
        }
        setPhotoOpen(false);
        setRecognitionHint(null);
        setLookupHint(
          `Référence fabricant : ${match.name}${
            match.brand ? ` · ${match.brand}` : ""
          }`
        );
        setMessage("Produit reconnu — saisissez la quantité (et le prix si manquant)");
        focusQuantityField();
        return;
      }

      setProductId(match.id);
      setProductName(match.name || "");
      setBrandName(match.brand || "");
      setRangeName(match.range || match.category || "");
      if (match.barcode) setBarcode(match.barcode);
      const matchPriceOk = match.priceCents != null && match.priceCents > 0;
      setLookup({
        found: true,
        name: match.name,
        brand: match.brand || undefined,
        range: match.range || undefined,
        unitPriceCents: matchPriceOk ? match.priceCents : null,
        priceSource: matchPriceOk ? "CATALOGUE" : null,
        priceMissing: !matchPriceOk,
        priceLocked: false,
        imageUrl: match.imageUrl,
      });
      setUnitPrice(
        matchPriceOk ? ((match.priceCents || 0) / 100).toFixed(2).replace(".", ",") : ""
      );
      setQuantity("");
      setShowSuggestions(false);
      setVisualSuggestions([]);

      const sid = sessionRef.current?.id;

      if (match.barcode && match.barcode.trim().length >= 6) {
        const ok = await lookupBarcode(match.barcode.trim());
        if (ok) {
          setPhotoOpen(false);
          setRecognitionHint(null);
          setMessage("Produit reconnu — saisissez uniquement la quantité");
          focusQuantityField();
          return;
        }
      }

      const qs = new URLSearchParams({ name: match.name });
      if (sid) qs.set("sessionId", sid);
      try {
        const res = await fetch(`/api/inventaire/lookup?${qs}`);
        const data = await res.json();
        if (res.ok && data.found && data.product?.name) {
          applyMemoryProduct(data);
          applyDuplicateFromLookup(data);
          if (match.barcode) setBarcode(match.barcode);
          if (!(data.product.brand) && match.brand) setBrandName(match.brand);
          if (!(data.product.range || data.product.category) && (match.range || match.category)) {
            setRangeName(match.range || match.category || "");
          }
        }
      } catch {
        /* garder le remplissage local */
      }

      setPhotoOpen(false);
      setRecognitionHint(null);
      setLookupHint(
        `Reconnaissance visuelle : ${match.name}${
          match.brand ? ` · ${match.brand}` : ""
        }${match.range ? ` · gamme ${match.range}` : ""}`
      );
      setMessage("Produit reconnu — saisissez uniquement la quantité");
      focusQuantityField();
    } finally {
      visualLookupBusyRef.current = false;
    }
  }

  /** Frame caméra Photo — local d’abord, puis identify Internet (limité). */
  const onPhotoFrame = async (canvas: HTMLCanvasElement) => {
    if (visualMatchBusyRef.current) return;
    if (visualLookupBusyRef.current) return;
    if (identifyBusyRef.current) return;
    if (photoRecognizedRef.current) return;
    if (visualSuggestionsRef.current.length > 0) return;

    const index = visualIndexRef.current;
    visualMatchBusyRef.current = true;
    setRecognitionHint((prev) => {
      if (
        prev === "Produit reconnu" ||
        (prev || "").startsWith("Recherche") ||
        (prev || "").startsWith("Plusieurs") ||
        (prev || "").startsWith("Aucun") ||
        (prev || "").startsWith("Texte") ||
        (prev || "").startsWith("EAN") ||
        (prev || "").startsWith("OCR") ||
        (prev || "").startsWith("Mémoire")
      ) {
        return prev;
      }
      return "Analyse du produit…";
    });
    try {
      // Attendre que la mémoire visuelle soit prête (ne pas brûler identify)
      if (!index.length) {
        setRecognitionHint("Mémoire visuelle en cours…");
        void loadVisualCatalogIndex();
        return;
      }

      const matches = matchVisualCanvas(canvas, index, {
        limit: 8,
        maxDistance: 28,
      });
      const decision = decideVisualAction(matches);

      if (decision.mode === "auto" && decision.picks[0]) {
        const pick = decision.picks[0];
        if (pick.id === lastVisualAutoIdRef.current) return;
        lastVisualAutoIdRef.current = pick.id;
        photoRecognizedRef.current = true;
        localMissStreakRef.current = 0;
        setRecognitionHint("Produit reconnu");
        await applyVisualProduct(pick);
        return;
      }

      if (decision.mode === "suggest") {
        localMissStreakRef.current = 0;
        visualSuggestionsRef.current = decision.picks;
        setRecognitionHint("Plusieurs résultats possibles — choisissez");
        setVisualSuggestions(decision.picks);
        return;
      }

      localMissStreakRef.current += 1;

      // Attendre plusieurs frames sans match + cooldown avant Internet
      if (localMissStreakRef.current < LOCAL_MISS_BEFORE_IDENTIFY) {
        setRecognitionHint((prev) =>
          prev &&
          prev !== "Analyse du produit…" &&
          !prev.startsWith("Mémoire")
            ? prev
            : "Présentez la face avant bien éclairée"
        );
        return;
      }

      // Sans OCR : ne pas spammer identify canvas — proposer le meilleur candidat faible
      if (!ocrAvailableRef.current) {
        if (matches.length > 0) {
          visualSuggestionsRef.current = matches.slice(0, 6);
          setVisualSuggestions(matches.slice(0, 6));
          setRecognitionHint("Produit proche — choisissez ou saisissez le nom");
          return;
        }
        setRecognitionHint(
          "Non reconnu — scannez l’EAN ou saisissez le nom (Liquidarom, E-Tasty, Juice 66…)"
        );
        return;
      }

      if (identifyAttemptsRef.current >= MAX_IDENTIFY_PER_PHOTO) {
        setRecognitionHint(
          "Non reconnu localement — saisissez le nom ou scannez l’EAN"
        );
        return;
      }
      await identifyUnknownProduct({ canvas });
    } finally {
      visualMatchBusyRef.current = false;
    }
  };

  /** EAN lu sur la face produit pendant Photo → local puis recherche élargie. */
  const onPhotoBarcodeFound = async (code: string) => {
    if (visualLookupBusyRef.current || identifyBusyRef.current) return;
    if (photoRecognizedRef.current) return;
    if (visualSuggestionsRef.current.length > 0) return;
    setRecognitionHint("Analyse du produit…");
    const ok = await lookupBarcode(code);
    if (ok) {
      photoRecognizedRef.current = true;
      setRecognitionHint("Produit reconnu");
      setPhotoOpen(false);
      setMessage("Produit reconnu — saisissez uniquement la quantité");
      focusQuantityField();
      return;
    }
    // EAN prioritaire : ne compte pas comme un spam canvas
    await identifyUnknownProduct({ barcode: code });
  };


  function selectSuggestionRow(s: VisualMatch & { source?: string; score?: number }) {
    setPhotoOpen(false);
    // Suggestions issues de product-identify (pas d’image catalogue)
    if (!s.imageUrl || String(s.id).startsWith("ext-") || (s.source && s.source !== "catalog")) {
      applyIdentifySuggestion({
        name: s.name,
        brand: s.brand || null,
        range: s.range || s.category || null,
        barcode: s.barcode || null,
        sku: null,
        source: s.source || "suggestion",
        confidence: s.score ?? 0.7,
        localProductId: String(s.id).startsWith("ext-") ? null : s.id,
        unitPriceCents: s.priceCents ?? null,
        unitPriceLabel: null,
        imageUrl: s.imageUrl || null,
      });
      return;
    }
    void applyVisualProduct(s);
  }

  async function lookupNameMemory(name: string) {
    const q = name.trim();
    if (q.length < 2) {
      setNameSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const sid = sessionRef.current?.id;
      const qs = new URLSearchParams({ name: q, suggest: "1" });
      if (sid) qs.set("sessionId", sid);
      const res = await fetch(`/api/inventaire/lookup?${qs}`);
      const data = await res.json();
      if (!res.ok) return;
      const list = data.suggestions || [];
      setNameSuggestions(list);
      setShowSuggestions(list.length > 0);

      // Auto-repérage fort : un seul match catalogue très proche
      if (!suggestOnlyAuto(list) && list.length === 1 && (list[0].score ?? 1) >= 0.9) {
        await selectNameSuggestion(list[0]);
      }
    } catch {
      /* ignore */
    }
  }

  function suggestOnlyAuto(list: Array<{ score?: number }>) {
    return list.length > 1;
  }

  async function selectNameSuggestion(s: {
    id: string;
    name: string;
    brand?: string | null;
    range?: string | null;
    barcode?: string | null;
    imageUrl?: string | null;
    unitPriceCents?: number | null;
    source?: string;
  }) {
    const sid = sessionRef.current?.id;
    setQuantity("");
    setShowSuggestions(false);
    // Re-fetch fiche complète si id catalogue
    if (s.source !== "session" && s.id && !s.id.startsWith("mem-")) {
      const qs = new URLSearchParams({ name: s.name });
      if (sid) qs.set("sessionId", sid);
      if (s.barcode) qs.set("barcode", s.barcode);
      const res = await fetch(`/api/inventaire/lookup?${qs}`);
      const data = await res.json();
      if (res.ok && data.found) {
        applyMemoryProduct(data);
        applyDuplicateFromLookup(data);
        focusQuantityField();
        setMessage("Fiche remplie — saisissez uniquement la quantité");
        return;
      }
    }
    if (s.barcode && sid) {
      await lookupBarcode(s.barcode);
      return;
    }
    setProductId(s.id.startsWith("mem-") ? null : s.id);
    setProductName(s.name);
    setBrandName(s.brand || "");
    setRangeName(s.range || "Non classé");
    if (s.barcode) setBarcode(s.barcode);
    const missing = s.unitPriceCents == null || s.unitPriceCents <= 0;
    setLookup({
      found: true,
      name: s.name,
      brand: s.brand || undefined,
      range: s.range || undefined,
      unitPriceCents: missing ? null : s.unitPriceCents,
      priceSource: "CATALOGUE",
      priceMissing: missing,
      priceLocked: !missing && me?.role !== "ADMIN",
      imageUrl: s.imageUrl,
    });
    setUnitPrice(
      missing ? "" : ((s.unitPriceCents || 0) / 100).toFixed(2).replace(".", ",")
    );
    setLookupHint(
      `Mémoire : ${s.name}${s.barcode ? ` · EAN ${s.barcode}` : " · sans EAN"}`
    );
    focusQuantityField();
    setMessage("Fiche remplie — saisissez uniquement la quantité");
  }

  function onProductNameChange(value: string) {
    setProductName(value);
    setProductId(null);
    if (nameLookupTimer.current != null) {
      window.clearTimeout(nameLookupTimer.current);
    }
    nameLookupTimer.current = window.setTimeout(() => {
      void lookupNameMemory(value);
    }, 280);
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
      void loadVisualCatalogIndex();
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
    if (code.length < 6 && !productId) {
      setError("Code-barres ou produit mémoire requis");
      return;
    }
    if (!productName.trim()) {
      setError("Nom du produit obligatoire");
      return;
    }
    if (quantity.trim() === "" || isNaN(qty) || qty < 0) {
      setError("Quantité obligatoire");
      return;
    }
    if (!unitPrice.trim()) {
      setError("Prix manquant — saisissez le tarif avant enregistrement");
      return;
    }

    // Doublon hors session courante (même jour / < 30 j) : bloqué
    if (
      duplicateInfo &&
      duplicateInfo.reason !== "SAME_SESSION" &&
      !(me?.role === "ADMIN")
    ) {
      setError(duplicateInfo.message);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        setError("Connexion requise pour enregistrer");
        setLoading(false);
        return;
      }

      // Doublon même session : mise à jour quantité (pas de nouvelle ligne)
      if (duplicateInfo?.reason === "SAME_SESSION" && duplicateInfo.lineId) {
        const res = await fetch(
          `/api/inventaire/sessions/${session.id}/lines/${duplicateInfo.lineId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quantityCounted: qty,
              reason: "correction quantité anti-doublon",
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Mise à jour impossible");
        rememberLineId(data.line.id);
        setMessage(
          `Quantité mise à jour : ${data.line.productNameSnapshot || productName} × ${qty}`
        );
        clearDraftLine();
        await refreshSession(session.id);
        barcodeRef.current?.focus();
        return;
      }

      const payload: Record<string, unknown> = {
        barcode: code || undefined,
        productId: productId || undefined,
        productName: productName.trim(),
        brand: brandName.trim() || undefined,
        range: rangeName.trim() || "Non classé",
        quantityCounted: qty,
        confirmZeroPrice: confirmZero,
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

      if (res.status === 409 && data.code === "DUPLICATE") {
        const dup = data.duplicate as {
          lineId?: string;
          sessionId?: string;
          reason?: "SAME_SESSION" | "SAME_DAY" | "WITHIN_MONTH";
          quantityCounted?: number;
          message?: string;
        } | null;
        setDuplicateInfo(
          dup?.lineId
            ? {
                lineId: dup.lineId,
                sessionId: dup.sessionId,
                message: data.error || dup.message || "Doublon",
                quantityCounted: dup.quantityCounted || 0,
                reason: dup.reason,
              }
            : null
        );
        if (dup?.reason === "SAME_SESSION" && dup.lineId) {
          setError(
            `${data.error} — saisissez la nouvelle quantité puis « Mettre à jour ».`
          );
          rememberLineId(dup.lineId);
        } else {
          setError(data.error || "Produit déjà inventorié");
        }
        return;
      }

      if (!res.ok) throw new Error(data.error || "Erreur ligne");

      const lineId = data.line.id as string;
      rememberLineId(lineId);

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

  async function completeSession() {
    if (!session) return;
    const ok = window.confirm(
      `Terminer l'inventaire ${session.location.name} ?\nChaque ligne doit avoir code-barres + prix.\nLes quantités seront appliquées à cette boutique.`
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
   * Scan caméra : EAN connu en mémoire → remplit TOUT sauf la quantité.
   * Pas d'enregistrement auto. Anti-doublon signalé.
   * Le comportement du scanner (détection EAN) n’est pas modifié.
   */
  const onBarcodeScanned = useCallback(async (code: string): Promise<boolean | void> => {
    const cleaned = code.trim();
    if (!cleaned || scanBusyRef.current) return;
    scanBusyRef.current = true;

    const current = sessionRef.current;
    setBarcode(cleaned);
    setError(null);
    setDuplicateInfo(null);
    setVisualSuggestions([]);

    try {
      if (!current || current.status !== "OPEN") {
        setMessage(`Code détecté : ${cleaned}`);
        return false;
      }

      const lookRes = await fetch(
        `/api/inventaire/lookup?barcode=${encodeURIComponent(cleaned)}&sessionId=${encodeURIComponent(current.id)}`
      );
      const look = await lookRes.json();
      if (!lookRes.ok) throw new Error(look.error || "Lookup impossible");

      if (look.found && look.product?.name) {
        applyMemoryProduct(look);
        applyDuplicateFromLookup(look);
        focusQuantityField();
        setRecognitionHint(null);
        setMessage(
          look.duplicate
            ? `Fiche remplie — ${look.duplicate.message}`
            : `Fiche remplie automatiquement — saisissez uniquement la quantité`
        );
        return false;
      }

      setLookup({
        found: false,
        priceMissing: true,
        priceLocked: false,
        unitPriceCents: null,
      });
      setProductName("");
      setBrandName("");
      setRangeName("");
      setProductId(null);
      setUnitPrice("");
      setQuantity("");
      setLookupHint(
        "EAN inconnu — appuyez sur Photo pour reconnaître l’étiquette, ou tapez le nom"
      );
      setMessage(`Code ${cleaned} inconnu en mémoire`);
      setError("Non trouvé — utilisez Photo ou saisissez le nom");
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur scan");
      return false;
    } finally {
      scanBusyRef.current = false;
    }
  }, []);

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

      <div className="mb-5">
        <InventoryInstallButton />
      </div>

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
                    setDuplicateInfo(null);
                  }}
                  onBlur={() => {
                    if (barcode.trim().length >= 6) {
                      void lookupBarcode(barcode.trim()).then(() => setQuantity(""));
                    }
                  }}
                  inputMode="numeric"
                  placeholder="Scanner ou saisir l’EAN"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setRecognitionHint(null);
                    setVisualSuggestions([]);
                    setScannerOpen(true);
                  }}
                  className="shrink-0 rounded-xl bg-emerald-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  aria-label="Scanner le code-barres"
                >
                  Scan
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Scan EAN : remplit la fiche connue. Si l’EAN est inconnu, utilisez Photo.
              </p>
            </label>
            {lookupHint && <p className="text-sm text-gray-600">{lookupHint}</p>}
            {visualSuggestions.length > 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-950">
                  Plusieurs produits ressemblent — choisissez
                </p>
                <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
                  {visualSuggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg bg-white px-2 py-2 text-left text-sm ring-1 ring-emerald-100 hover:bg-emerald-50"
                        onClick={() => {
                          setPhotoOpen(false);
                          selectSuggestionRow(s);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-md object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-gray-900">{s.name}</span>
                          <span className="block text-xs text-gray-500">
                            {[s.brand, s.range || s.category, s.barcode ? `EAN ${s.barcode}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-emerald-800 underline"
                  onClick={() => {
                    visualSuggestionsRef.current = [];
                    setVisualSuggestions([]);
                    localMissStreakRef.current = 0;
                    setRecognitionHint(
                      "Produit non reconnu, rapprochez ou repositionnez le produit"
                    );
                  }}
                >
                  Ignorer les suggestions
                </button>
              </div>
            ) : null}
            {duplicateInfo ? (
              <div
                className={`rounded-xl px-3 py-2 text-sm ${
                  duplicateInfo.reason === "SAME_SESSION"
                    ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200"
                    : "bg-red-50 text-red-900 ring-1 ring-red-200"
                }`}
              >
                <p className="font-semibold">Anti-doublon</p>
                <p className="mt-0.5">{duplicateInfo.message}</p>
                {duplicateInfo.reason === "SAME_SESSION" ? (
                  <p className="mt-1 text-xs">
                    Ancienne qté : {duplicateInfo.quantityCounted} — entrez la nouvelle puis « Mettre à jour ».
                  </p>
                ) : (
                  <p className="mt-1 text-xs">
                    Impossible de recréer ce produit (même jour ou &lt; 30 jours).
                  </p>
                )}
              </div>
            ) : null}
            {lookup?.imageUrl ? (
              <div className="relative inline-block overflow-hidden rounded-lg ring-1 ring-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lookup.imageUrl}
                  alt={productName || lookup.name || "Produit"}
                  className="h-28 w-28 rounded-lg object-cover"
                  loading="eager"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 text-[10px] font-semibold leading-tight text-white">
                  {productName || lookup.name || "Produit"}
                </span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <label className="relative block">
                <span className="text-sm font-medium">Nom produit *</span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                  value={productName}
                  onChange={(e) => onProductNameChange(e.target.value)}
                  onFocus={() => {
                    if (nameSuggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="Tapez pour rechercher en mémoire"
                  autoComplete="off"
                />
                {showSuggestions && nameSuggestions.length > 0 ? (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    {nameSuggestions.map((s) => (
                      <li key={`${s.source || "c"}-${s.id}`}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-emerald-50"
                          onClick={() => void selectNameSuggestion(s)}
                        >
                          <span className="font-medium text-gray-900">{s.name}</span>
                          <span className="text-xs text-gray-500">
                            {[s.brand, s.range, s.barcode ? `EAN ${s.barcode}` : null, s.unitPriceLabel]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
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
                  <span className="text-sm font-medium">Gamme</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
                    value={rangeName}
                    onChange={(e) => setRangeName(e.target.value)}
                    placeholder="Gamme (auto si connue)"
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
                  ref={quantityRef}
                  type="number"
                  min={0}
                  className="mt-1.5 w-full rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-3 text-base"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="À saisir"
                  inputMode="numeric"
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
                onChange={(e) => {
                  if (e.target.checked) {
                    const ok = window.confirm(
                      "Confirmer : appliquer ce prix à TOUTE la gamme ?"
                    );
                    if (!ok) return;
                  }
                  setApplyToRange(e.target.checked);
                }}
              />
              <span>
                Appliquer ce prix à <strong>toute la gamme</strong>
                {rangeName ? ` « ${rangeName} »` : ""} (désactivé par défaut — confirmation requise)
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

            <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-3">
              <p className="text-sm font-medium text-gray-900">Photo</p>
              <p className="mt-1 text-xs text-gray-600">
                Caméra visuelle : catalogue local puis sites officiels fabricants
                (Liquidarom, LiquideLab, E-Tasty, Juice 66, Vape 47…). Images
                fabricants en lecture seule. Aucune photo n’est enregistrée.
                {visualReady ? " · Mémoire visuelle prête" : " · Préparation mémoire…"}
              </p>
              <button
                type="button"
                disabled={loading || !session}
                onClick={() => {
                  lastVisualAutoIdRef.current = "";
                  photoRecognizedRef.current = false;
                  identifyAttemptsRef.current = 0;
                  localMissStreakRef.current = 0;
                  lastCanvasIdentifyAtRef.current = 0;
                  lastIdentifyKeyRef.current = "";
                  identifyAbortRef.current?.abort();
                  identifyAbortRef.current = null;
                  visualSuggestionsRef.current = [];
                  setVisualSuggestions([]);
                  setRecognitionHint(
                    visualIndexRef.current.length
                      ? "Présentez la face avant du produit devant la caméra"
                      : "Chargement mémoire visuelle…"
                  );
                  // Ne recharge QUE si index vide (évite wipe + miss streak)
                  if (visualIndexRef.current.length === 0) {
                    void loadVisualCatalogIndex();
                  }
                  setPhotoOpen(true);
                }}
                className="mt-2 w-full rounded-xl bg-gray-900 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Photo
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={
                  loading ||
                  (barcode.trim().length < 6 && !productId) ||
                  !productName.trim() ||
                  !unitPrice.trim() ||
                  quantity.trim() === "" ||
                  (Boolean(duplicateInfo) &&
                    duplicateInfo?.reason !== "SAME_SESSION" &&
                    me?.role !== "ADMIN")
                }
                onClick={() => void addLine()}
                className="rounded-xl bg-emerald-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {duplicateInfo?.reason === "SAME_SESSION"
                  ? "Mettre à jour la quantité"
                  : "Enregistrer"}
              </button>
            </div>
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
            {(session.lines || []).map((l) => {
              const name = l.productNameSnapshot || l.product?.name || "Sans nom";
              const thumb =
                (l.photos && l.photos[0]?.publicUrl) || l.photoPath || null;
              return (
                <li
                  key={l.id}
                  className="flex gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
                    {thumb ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumb} alt={name} className="h-full w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-[9px] font-semibold leading-tight text-white line-clamp-2">
                          {name}
                        </span>
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-1 text-center text-[9px] font-semibold text-red-700">
                        Sans photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">
                      {name} × {l.quantityCounted}
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
                      {l.scannedAt || l.createdAt
                        ? ` · ${new Date(l.scannedAt || l.createdAt!).toLocaleTimeString("fr-FR")}`
                        : ""}
                    </div>
                  </div>
                </li>
              );
            })}
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

      {visualSuggestions.length > 0 && photoOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[45vh] overflow-auto rounded-t-2xl bg-white p-4 shadow-2xl">
          <p className="text-sm font-semibold text-gray-900">
            Plusieurs produits possibles — choisissez
          </p>
          <ul className="mt-2 space-y-1">
            {visualSuggestions.map((s) => (
              <li key={`overlay-${s.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-emerald-50"
                  onClick={() => {
                    setPhotoOpen(false);
                    selectSuggestionRow(s);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.imageUrl ? (
                    <img src={s.imageUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-[10px] text-gray-400">
                      —
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block text-xs text-gray-500">
                      {[s.brand, s.range || s.category].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 w-full rounded-xl border border-gray-300 py-2 text-sm font-semibold"
            onClick={() => {
              visualSuggestionsRef.current = [];
              setVisualSuggestions([]);
              localMissStreakRef.current = 0;
              setRecognitionHint(
                "Produit non reconnu, rapprochez ou repositionnez le produit"
              );
            }}
          >
            Continuer l’analyse
          </button>
        </div>
      ) : null}

      {/* Scanner EAN — inchangé, sans reconnaissance visuelle */}
      <BarcodeCameraScanner
        open={scannerOpen}
        continuous
        onClose={() => setScannerOpen(false)}
        onDetected={onBarcodeScanned}
      />

      {/* Bouton Photo — reconnaissance visuelle du flux, aucune capture */}
      <VisualRecognitionCamera
        open={photoOpen}
        onClose={() => {
          identifyAbortRef.current?.abort();
          identifyAbortRef.current = null;
          identifyBusyRef.current = false;
          setPhotoOpen(false);
          setRecognitionHint(null);
        }}
        onFrame={onPhotoFrame}
        onBarcodeFound={onPhotoBarcodeFound}
        status={recognitionHint}
        intervalMs={480}
        paused={visualSuggestions.length > 0 || photoRecognizedRef.current}
      />
    </div>
  );
}
