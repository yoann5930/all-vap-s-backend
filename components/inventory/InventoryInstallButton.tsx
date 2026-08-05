"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Bouton « Télécharger l’application » inventaire (PWA).
 * Android / Samsung / Chrome : install native via beforeinstallprompt.
 * iPhone / iPad : consignes Ajouter à l’écran d’accueil.
 */
export function InventoryInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      Boolean(window.navigator.standalone);
    if (standalone) {
      setInstalled(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-800">
        Application inventaire installée sur cet appareil
      </p>
    );
  }

  const isIos =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  async function installAndroid() {
    if (!deferred) {
      setShowIosHelp(true);
      return;
    }
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } catch {
      setShowIosHelp(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">
        Télécharger l’application téléphone
      </p>
      <p className="mt-1 text-xs text-gray-600">
        Android, Samsung et iPhone — inventaire en plein écran, sans store.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void installAndroid()}
          className="rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Installation…" : "Installer (Android / Samsung)"}
        </button>
        <button
          type="button"
          onClick={() => setShowIosHelp((v) => !v)}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
        >
          Installer (iPhone / iPad)
        </button>
      </div>
      {(showIosHelp || isIos) && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-gray-700">
          <li>Ouvrez cette page dans Safari (iPhone) ou Chrome (Android).</li>
          <li>
            iPhone : touchez Partager <span aria-hidden>⬆︎</span> puis « Sur
            l’écran d’accueil ».
          </li>
          <li>
            Android / Samsung : menu ⋮ → « Installer l’application » ou
            « Ajouter à l’écran d’accueil ».
          </li>
          <li>Lancez l’icône « Inventaire » comme une app.</li>
        </ol>
      )}
    </div>
  );
}
