"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { MapPin, Phone, Navigation, RefreshCw } from "lucide-react";
import { getStoreById, type Store } from "@/lib/stores";
import {
  findNearestStore,
  formatDistanceLabel,
  formatStorePhone,
  googleMapsDirectionsUrl,
  telHref,
  wazeNavigateUrl,
  type NearestStoreResult,
} from "@/lib/stores/nearest";
import {
  clearPreferredStoreId,
  getPreferredStoreId,
  setPreferredStoreId,
  type PreferredStoreId,
} from "@/lib/stores/preferred-store";

type UiState =
  | "idle"
  | "consent"
  | "locating"
  | "found"
  | "denied"
  | "blocked"
  | "unsupported"
  | "error"
  | "manual"
  | "manual-searching";

type DisplayResult = {
  store: Store;
  distanceKm: number | null;
  driveMinutesApprox: number | null;
  otherStore: Store;
};

function toDisplay(result: NearestStoreResult): DisplayResult {
  return {
    store: result.store,
    distanceKm: result.distanceKm,
    driveMinutesApprox: result.driveMinutesApprox,
    otherStore: result.otherStore,
  };
}

function persistFromResult(result: DisplayResult) {
  if (result.store.id === "hautmont" || result.store.id === "le-quesnoy") {
    setPreferredStoreId(result.store.id);
  }
}

export function FindNearestStore() {
  const titleId = useId();
  const statusId = useId();
  const [state, setState] = useState<UiState>("idle");
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [privacyNote] = useState(
    "Votre position est utilisée uniquement pour identifier la boutique la plus proche."
  );

  useEffect(() => {
    const id = getPreferredStoreId();
    if (!id) return;
    const store = getStoreById(id);
    if (!store) return;
    const other = getStoreById(id === "hautmont" ? "le-quesnoy" : "hautmont");
    if (!other) return;
    setResult({
      store,
      distanceKm: null,
      driveMinutesApprox: null,
      otherStore: other,
    });
    setState("found");
  }, []);

  const applyResult = useCallback((r: NearestStoreResult) => {
    const d = toDisplay(r);
    setResult(d);
    persistFromResult(d);
    setShowOther(false);
    setState("found");
  }, []);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }

    setState("locating");
    setManualError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Calcul en mémoire uniquement — jamais localStorage / logs / API serveur
        applyResult(findNearestStore(latitude, longitude));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // Distinction refus vs bloqué : impossible de façon fiable partout ;
          // message « bloqué » si Permissions API indique denied sans prompt récent.
          if (typeof navigator.permissions?.query === "function") {
            navigator.permissions
              .query({ name: "geolocation" as PermissionName })
              .then((status) => {
                setState(status.state === "denied" ? "blocked" : "denied");
              })
              .catch(() => setState("denied"));
          } else {
            setState("denied");
          }
          return;
        }
        setState("error");
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [applyResult]);

  const onFindClick = () => {
    setState("consent");
  };

  const onConfirmLocate = () => {
    requestGeolocation();
  };

  const runManualSearch = async () => {
    const q = manualQuery.trim();
    if (q.length < 2) {
      setManualError("Indiquez une ville ou un code postal.");
      return;
    }
    setState("manual-searching");
    setManualError(null);
    try {
      const res = await fetch("/api/stores/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setManualError(
          data.message ||
            "Ville ou code postal non reconnu. Essayez Hautmont ou Le Quesnoy."
        );
        setState("manual");
        return;
      }
      const store = getStoreById(data.storeId as PreferredStoreId);
      const other = getStoreById(
        (data.otherStore?.id as PreferredStoreId) ||
          (data.storeId === "hautmont" ? "le-quesnoy" : "hautmont")
      );
      if (!store || !other) {
        setManualError("Boutique introuvable.");
        setState("manual");
        return;
      }
      const d: DisplayResult = {
        store,
        distanceKm:
          typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
            ? data.distanceKm
            : null,
        driveMinutesApprox: data.driveMinutesApprox ?? null,
        otherStore: other,
      };
      setResult(d);
      persistFromResult(d);
      setShowOther(false);
      setState("found");
    } catch {
      setManualError("Recherche indisponible. Réessayez dans un instant.");
      setState("manual");
    }
  };

  const changeStore = () => {
    clearPreferredStoreId();
    setResult(null);
    setShowOther(false);
    setManualQuery("");
    setManualError(null);
    setState("idle");
  };

  return (
    <section
      aria-labelledby={titleId}
      className="border-t border-white/5 bg-[#0b1018] py-10 sm:py-12"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/8 bg-[#101720]/90 px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
                Boutiques
              </p>
              <h2 id={titleId} className="mt-2 font-display text-xl text-white sm:text-2xl">
                Trouvez votre boutique All Vap&apos;s la plus proche
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#A7B0BC]">
                Autorisez votre localisation pour obtenir automatiquement les
                coordonnées, le numéro de téléphone et l&apos;itinéraire vers la
                boutique la plus proche de chez vous.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
              <MapPin className="h-5 w-5" aria-hidden />
            </div>
          </div>

          <div id={statusId} className="mt-5" aria-live="polite" aria-atomic="true">
            {state === "idle" && (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={onFindClick}
                  className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-premium-black transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                >
                  Trouver ma boutique
                </button>
                <button
                  type="button"
                  onClick={() => setState("manual")}
                  className="text-sm text-[#A7B0BC] underline-offset-4 transition hover:text-brand-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                >
                  Saisir ma ville ou mon code postal
                </button>
              </div>
            )}

            {state === "consent" && (
              <div className="space-y-4">
                <p className="text-sm text-[#C5CDD6]">
                  Votre position sert uniquement à identifier la boutique All
                  Vap&apos;s la plus proche. Elle n&apos;est ni enregistrée ni
                  partagée.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={onConfirmLocate}
                    className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-premium-black transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                  >
                    Autoriser et trouver
                  </button>
                  <button
                    type="button"
                    onClick={() => setState("manual")}
                    className="text-sm text-[#A7B0BC] underline-offset-4 transition hover:text-brand-400 hover:underline"
                  >
                    Saisir ma ville ou mon code postal
                  </button>
                  <button
                    type="button"
                    onClick={() => setState("idle")}
                    className="text-sm text-[#7A8490] hover:text-[#A7B0BC]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {(state === "locating" || state === "manual-searching") && (
              <p className="flex items-center gap-2 text-sm text-brand-300">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                Recherche de la boutique la plus proche…
              </p>
            )}

            {state === "denied" && (
              <div className="space-y-4">
                <p className="text-sm text-[#C5CDD6]">
                  La localisation n&apos;a pas été autorisée. Vous pouvez saisir
                  votre ville ou votre code postal pour trouver la boutique la
                  plus proche.
                </p>
                <ManualFields
                  query={manualQuery}
                  setQuery={setManualQuery}
                  error={manualError}
                  onSearch={runManualSearch}
                />
              </div>
            )}

            {state === "blocked" && (
              <div className="space-y-4">
                <p className="text-sm text-[#C5CDD6]">
                  Pour identifier automatiquement la boutique la plus proche,
                  activez la localisation dans les paramètres de votre
                  navigateur. Vous pouvez également saisir votre ville ou votre
                  code postal.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={onConfirmLocate}
                    className="inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                  >
                    Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={() => setState("manual")}
                    className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-premium-black transition hover:bg-brand-400"
                  >
                    Saisir ma ville
                  </button>
                </div>
              </div>
            )}

            {state === "unsupported" && (
              <div className="space-y-4">
                <p className="text-sm text-[#C5CDD6]">
                  Votre navigateur ne prend pas en charge la géolocalisation.
                  Saisissez votre ville ou votre code postal.
                </p>
                <ManualFields
                  query={manualQuery}
                  setQuery={setManualQuery}
                  error={manualError}
                  onSearch={runManualSearch}
                />
              </div>
            )}

            {state === "error" && (
              <div className="space-y-4">
                <p className="text-sm text-[#C5CDD6]">
                  Impossible d&apos;obtenir votre position. Vous pouvez saisir
                  votre ville ou votre code postal.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onConfirmLocate}
                    className="inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-400"
                  >
                    Réessayer
                  </button>
                </div>
                <ManualFields
                  query={manualQuery}
                  setQuery={setManualQuery}
                  error={manualError}
                  onSearch={runManualSearch}
                />
              </div>
            )}

            {state === "manual" && (
              <ManualFields
                query={manualQuery}
                setQuery={setManualQuery}
                error={manualError}
                onSearch={runManualSearch}
                onBack={() => setState("idle")}
              />
            )}

            {state === "found" && result && (
              <FoundStore
                result={result}
                showOther={showOther}
                setShowOther={setShowOther}
                onChange={changeStore}
                privacyNote={privacyNote}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ManualFields({
  query,
  setQuery,
  error,
  onSearch,
  onBack,
}: {
  query: string;
  setQuery: (v: string) => void;
  error: string | null;
  onSearch: () => void;
  onBack?: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <label className="block text-sm text-[#A7B0BC]" htmlFor="nearest-store-query">
        Ville ou code postal
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          id="nearest-store-query"
          type="text"
          inputMode="text"
          autoComplete="postal-code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex. Hautmont, 59330…"
          className="w-full max-w-md rounded-xl border border-white/12 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-[#6B7280] focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-premium-black transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          Rechercher ma boutique
        </button>
      </div>
      {error && (
        <p className="text-sm text-amber-300/90" role="alert">
          {error}
        </p>
      )}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[#7A8490] hover:text-[#A7B0BC]"
        >
          Retour
        </button>
      )}
    </form>
  );
}

function FoundStore({
  result,
  showOther,
  setShowOther,
  onChange,
  privacyNote,
}: {
  result: DisplayResult;
  showOther: boolean;
  setShowOther: (v: boolean) => void;
  onChange: () => void;
  privacyNote: string;
}) {
  const { store, otherStore, distanceKm, driveMinutesApprox } = result;
  const phoneDisplay = formatStorePhone(store.phone);
  const shortCity =
    store.city === "Le Quesnoy" ? "Le Quesnoy" : store.city;

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-white">
        La boutique All Vap&apos;s la plus proche de vous est {store.name}.
      </p>

      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-4 sm:px-5">
        <h3 className="font-display text-lg text-white">{store.name}</h3>
        <address className="mt-2 not-italic text-sm leading-relaxed text-[#C5CDD6]">
          {store.address}
          <br />
          {store.postalCode} {store.city}
          <br />
          <a
            href={telHref(store)}
            className="mt-1 inline-block text-brand-400 hover:text-brand-300"
          >
            {phoneDisplay}
          </a>
        </address>

        {(distanceKm != null || driveMinutesApprox != null) && (
          <p className="mt-3 text-xs text-[#8B95A1]">
            {distanceKm != null && (
              <>Distance approximative : {formatDistanceLabel(distanceKm)}</>
            )}
            {distanceKm != null && driveMinutesApprox != null && " · "}
            {driveMinutesApprox != null && (
              <>environ {driveMinutesApprox}&nbsp;min en voiture</>
            )}
          </p>
        )}

        <ul className="mt-3 space-y-0.5 text-xs text-[#8B95A1]">
          {store.hours.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a
            href={telHref(store)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-premium-black transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Appeler la boutique
          </a>
          <a
            href={googleMapsDirectionsUrl(store)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Ouvrir dans Google Maps
          </a>
          <a
            href={wazeNavigateUrl(store)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            Ouvrir dans Waze
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={() => setShowOther(!showOther)}
          className="text-sm text-[#A7B0BC] underline-offset-4 hover:text-brand-400 hover:underline"
          aria-expanded={showOther}
        >
          Voir également l&apos;autre boutique
        </button>
        <button
          type="button"
          onClick={onChange}
          className="text-sm text-[#7A8490] underline-offset-4 hover:text-brand-400 hover:underline"
        >
          Changer de boutique
        </button>
      </div>

      {showOther && (
        <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-[#C5CDD6]">
          <p className="font-medium text-white">{otherStore.name}</p>
          <p className="mt-1">
            {otherStore.address}
            <br />
            {otherStore.postalCode} {otherStore.city}
            <br />
            {formatStorePhone(otherStore.phone)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={telHref(otherStore)}
              className="text-brand-400 hover:text-brand-300"
            >
              Appeler
            </a>
            <span className="text-[#4B5563]">·</span>
            <a
              href={googleMapsDirectionsUrl(otherStore)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300"
            >
              Google Maps
            </a>
            <span className="text-[#4B5563]">·</span>
            <a
              href={wazeNavigateUrl(otherStore)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300"
            >
              Waze
            </a>
          </div>
        </div>
      )}

      <p className="text-xs text-[#6B7280]">{privacyNote}</p>
      <p className="sr-only">
        Boutique sélectionnée : {shortCity}. Téléphone {phoneDisplay}.
      </p>
    </div>
  );
}
