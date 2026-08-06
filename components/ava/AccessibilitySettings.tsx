"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { AvaAccessibilityPrefs } from "@/lib/ava/accessibility-mode";

type Props = {
  prefs: AvaAccessibilityPrefs;
  onChange: (patch: Partial<AvaAccessibilityPrefs>) => void;
};

/**
 * Options discrètes — Accessibilité et confidentialité.
 * Pas au centre de l'UI ; pas un bouton micro.
 */
export function AccessibilitySettings({ prefs, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-[85]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-800/30 px-2.5 py-1.5 text-[10px] tracking-wide text-cyan-600/50 transition hover:border-cyan-600/40 hover:text-cyan-400/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
        aria-expanded={open}
        aria-controls="ava-a11y-panel"
      >
        <Settings2 className="h-3 w-3" strokeWidth={1.5} aria-hidden />
        Accessibilité et confidentialité
      </button>

      {open ? (
        <div
          id="ava-a11y-panel"
          role="region"
          aria-label="Accessibilité et confidentialité"
          className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-cyan-500/25 bg-black/95 p-3 text-left shadow-lg backdrop-blur-md"
        >
          <p className="mb-2 text-[10px] leading-relaxed text-cyan-500/60">
            Le micro n&apos;écoute que lorsque cette fenêtre AVA est ouverte et
            après votre autorisation. Fermer AVA coupe immédiatement l&apos;écoute.
            Aucun enregistrement n&apos;est conservé.
          </p>

          <label className="mb-2 flex cursor-pointer items-start gap-2 text-xs text-cyan-100/80">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={prefs.pauseListening}
              onChange={(e) => onChange({ pauseListening: e.target.checked })}
            />
            <span>
              Suspendre l&apos;écoute vocale
              <span className="mt-0.5 block text-[10px] text-cyan-600/55">
                Le clavier et les sous-titres restent disponibles.
              </span>
            </span>
          </label>

          <label className="mb-2 flex cursor-pointer items-start gap-2 text-xs text-cyan-100/80">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={prefs.subtitlesAlways}
              onChange={(e) => onChange({ subtitlesAlways: e.target.checked })}
            />
            <span>Sous-titres toujours visibles</span>
          </label>

          <label className="mb-2 flex cursor-pointer items-start gap-2 text-xs text-cyan-100/80">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={prefs.largeText}
              onChange={(e) => onChange({ largeText: e.target.checked })}
            />
            <span>Texte plus grand</span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 text-xs text-cyan-100/80">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={prefs.highContrast}
              onChange={(e) => onChange({ highContrast: e.target.checked })}
            />
            <span>Contraste renforcé</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
