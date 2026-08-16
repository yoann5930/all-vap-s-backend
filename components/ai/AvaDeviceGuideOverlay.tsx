"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, X } from "lucide-react";
import type { AvaDeviceGuideView } from "@/lib/ava/device-guide-present";

type Props = {
  guide: AvaDeviceGuideView;
  onClose: () => void;
};

/**
 * Guide matériel — coin d’écran, non bloquant, sans bouton « Besoin d’aide ? ».
 * AVA l’ouvre automatiquement après sélection / commande.
 */
export function AvaDeviceGuideOverlay({ guide, onClose }: Props) {
  const [minimized, setMinimized] = useState(false);
  const [step, setStep] = useState(0);
  const sections = guide.sections;
  const current = sections[step];

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-20 right-3 z-[62] max-w-[46vw] rounded-full border border-cyan-400/40 bg-black/80 px-3 py-2 text-[11px] text-cyan-100 shadow-lg sm:bottom-6 sm:right-6"
      >
        Guide {guide.model || "AVA"}
      </button>
    );
  }

  return (
    <aside
      className="pointer-events-auto fixed bottom-20 right-3 z-[62] w-[min(92vw,20rem)] rounded-2xl border border-cyan-400/35 bg-black/85 p-3 text-cyan-50 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md sm:bottom-6 sm:right-6"
      aria-label="Guide AVA du matériel"
    >
      <div className="mb-2 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-cyan-200">
          {guide.available ? guide.model || "Guide AVA" : "Notice à vérifier"}
        </p>
        <button
          type="button"
          className="rounded-md p-1.5 text-cyan-300/80 hover:bg-cyan-500/15"
          aria-label="Réduire"
          onClick={() => setMinimized(true)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-cyan-300/80 hover:bg-cyan-500/15"
          aria-label="Fermer le guide"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-cyan-100/85">{guide.spoken}</p>
      {current ? (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/30 p-2.5">
          <p className="text-[11px] font-semibold text-cyan-300">{current.title}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-gray-200">
            {current.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {sections.length > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-cyan-200 disabled:opacity-30"
            disabled={step <= 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Retour
          </button>
          <span className="text-[10px] text-cyan-400/70">
            {step + 1} / {sections.length}
          </span>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-cyan-200 disabled:opacity-30"
            disabled={step >= sections.length - 1}
            onClick={() => setStep((s) => Math.min(sections.length - 1, s + 1))}
          >
            Suite
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
