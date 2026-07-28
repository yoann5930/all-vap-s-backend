"use client";

import Image from "next/image";
import { Mic, Truck, ShieldCheck, Gift, MessageCircle } from "lucide-react";

const SUGGESTIONS = [
  "Je débute la vape",
  "Quel taux de nicotine choisir ?",
  "Quels sont les meilleurs fruits ?",
  "Quel matériel pour commencer ?",
];

const BENEFITS = [
  { icon: Truck, title: "LIVRAISON RAPIDE", subtitle: "24/48h avec suivi" },
  { icon: ShieldCheck, title: "PAIEMENT SÉCURISÉ", subtitle: "Viva.com" },
  { icon: Gift, title: "PROGRAMME FIDÉLITÉ", subtitle: "Des avantages exclusifs" },
  { icon: MessageCircle, title: "CONSEILS D'EXPERTS", subtitle: "En boutique et en ligne" },
];

function openAva() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("allvaps:open-ava"));
  }
}

/** Panneau A.V.A. — colonne droite maquette */
export function AvaSidePanel({ showBenefits = true }: { showBenefits?: boolean }) {
  return (
    <aside className="flex w-full flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B1016]/95 shadow-[0_0_40px_rgba(0,174,239,0.08)]">
        <div className="flex items-start gap-3 border-b border-white/8 px-4 py-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-brand-500/40">
            <Image
              src="/ava/ava-portrait.png"
              alt="A.V.A."
              fill
              className="object-cover"
              sizes="56px"
            />
          </div>
          <div>
            <p className="font-display text-xl font-semibold tracking-wide text-white">A.V.A.</p>
            <p className="text-xs text-[#A7B0BC]">Votre assistante vape</p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-[13px] leading-relaxed text-[#D5DBE4]">
            Bonjour ! Je suis A.V.A.
            <br />
            Comment puis-je vous aider à trouver votre produit idéal ?
          </div>

          <div className="space-y-2">
            {SUGGESTIONS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={openAva}
                className="w-full rounded-full border border-white/10 bg-transparent px-3 py-2 text-left text-[12px] text-[#A7B0BC] transition-colors hover:border-brand-500/40 hover:text-brand-300"
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openAva}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-premium-black transition-colors hover:bg-brand-400"
          >
            <Mic className="h-4 w-4" />
            Discuter avec A.V.A.
          </button>
          <p className="text-center text-[10px] text-[#A7B0BC]/70">Réponse instantanée 24/7</p>
        </div>
      </div>

      {showBenefits && (
        <div className="space-y-2 rounded-2xl border border-white/8 bg-[#0B1016]/80 p-3">
          {BENEFITS.map(({ icon: Icon, title, subtitle }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-xl px-2 py-2.5 text-left"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" strokeWidth={1.75} />
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-white">{title}</p>
                <p className="text-[11px] text-[#A7B0BC]">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
