"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Installation téléphone inventaire :
 * - clic = téléchargement du guide (fichier HTML)
 * - + étapes claires Android / iPhone
 * - + install PWA native si le navigateur le propose
 */
export function InventoryInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

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

  function downloadGuide() {
    // Téléchargement réel d’un fichier (fonctionne hors PWA)
    const a = document.createElement("a");
    a.href = "/guides/installer-inventaire.html";
    a.download = "AllVaps-Installer-Inventaire.html";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setHint(
      isIos
        ? "Guide téléchargé. Sur iPhone : Safari → Partager → Sur l’écran d’accueil."
        : "Guide téléchargé. Sur Android : Chrome → ⋮ → Installer l’application."
    );
  }

  async function tryNativeInstall() {
    if (!deferred) {
      downloadGuide();
      setHint(
        "Ce navigateur n’affiche pas encore « Installer ». Suivez le guide téléchargé (Chrome Android / Safari iPhone)."
      );
      return;
    }
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setHint("Installation acceptée — cherchez l’icône Inventaire.");
      } else {
        downloadGuide();
      }
      setDeferred(null);
    } catch {
      downloadGuide();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">
        Installer sur le téléphone
      </p>
      <p className="mt-1 text-xs text-gray-600">
        Un clic télécharge le guide. Puis ajoutez l’app à l’écran d’accueil
        (pas de Play Store / App Store).
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={downloadGuide}
          className="rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white"
        >
          Télécharger le guide
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void tryNativeInstall()}
          className="rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy
            ? "Installation…"
            : deferred
              ? "Installer maintenant"
              : "Android / iPhone — comment faire"}
        </button>
      </div>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-gray-700">
        <li>
          <strong>Android / Samsung</strong> (Chrome) : menu ⋮ → « Installer
          l’application » ou « Ajouter à l’écran d’accueil ».
        </li>
        <li>
          <strong>iPhone</strong> (Safari uniquement) : Partager → « Sur
          l’écran d’accueil » → Ajouter.
        </li>
        <li>Ouvrez l’icône « Inventaire » comme une app.</li>
      </ol>

      {hint ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
