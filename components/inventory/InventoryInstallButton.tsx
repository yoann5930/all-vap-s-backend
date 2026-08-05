"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Bouton unique : télécharge l’APK Android Inventaire sur le téléphone.
 * (iPhone : pas de sideload IPA — propose l’install PWA native si dispo.)
 */
export function InventoryInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [apkOk, setApkOk] = useState(true);

  const isIos =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

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

    // Vérifie que l’APK est servi
    fetch("/apps/AllVaps-Inventaire.apk", { method: "HEAD" })
      .then((r) => setApkOk(r.ok))
      .catch(() => setApkOk(false));

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

  function downloadApk() {
    const a = document.createElement("a");
    a.href = "/apps/AllVaps-Inventaire.apk";
    a.download = "AllVaps-Inventaire.apk";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setHint(
      "Téléchargement de l’application… Ouvrez le fichier .apk puis Autoriser l’installation."
    );
  }

  async function onClickInstall() {
    setBusy(true);
    setHint(null);
    try {
      if (isIos) {
        if (deferred) {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
          setHint("Installation lancée — cherchez l’icône Inventaire.");
          return;
        }
        setHint(
          "Sur iPhone : Safari → bouton Partager → « Sur l’écran d’accueil »."
        );
        return;
      }
      // Android / Samsung : fichier APK réel
      if (apkOk) {
        downloadApk();
        return;
      }
      // Fallback PWA native si APK absent
      if (deferred) {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
        setHint("Installation lancée — cherchez l’icône Inventaire.");
        return;
      }
      setHint("Application indisponible pour le moment — réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">
        Application téléphone
      </p>
      <p className="mt-1 text-xs text-gray-600">
        Un clic télécharge l’appli Inventaire sur votre téléphone (Android /
        Samsung).
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onClickInstall()}
        className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-3.5 text-base font-semibold text-white disabled:opacity-60"
      >
        {busy
          ? "Téléchargement…"
          : isIos
            ? "Installer sur iPhone"
            : "Télécharger l’application"}
      </button>
      {hint ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
