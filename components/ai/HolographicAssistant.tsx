"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { AssistantButton } from "@/components/ai/AssistantButton";
import { AVA_OPEN_EVENT, type PendingAvaIntent } from "@/lib/ava/quick-actions";

const ImmersiveAvaScreen = lazy(() =>
  import("@/components/ai/ImmersiveAvaScreen").then((m) => ({
    default: m.ImmersiveAvaScreen,
  }))
);

export function HolographicAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [intentSignal, setIntentSignal] = useState<PendingAvaIntent | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<PendingAvaIntent & { needsConfirm?: boolean; general?: boolean }>)
        .detail;
      setIsOpen(true);
      if (detail?.general) {
        return;
      }
      if (detail?.id && detail?.intent) {
        setNeedsConfirm(Boolean(detail.needsConfirm));
        setIntentSignal({
          id: detail.id,
          intent: detail.intent,
          createdAt: detail.createdAt ?? Date.now(),
          consumed: false,
        });
      }
    };
    window.addEventListener(AVA_OPEN_EVENT, open);
    return () => window.removeEventListener(AVA_OPEN_EVENT, open);
  }, []);

  // Deep-link : /?ava=1 ou /#ava → ouvrir l’écran immersif
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");
    if (q.get("ava") === "1" || hash === "ava") {
      setIsOpen(true);
    }
  }, []);

  return (
    <>
      <AssistantButton
        onClick={() => {
          setNeedsConfirm(false);
          setIntentSignal(null);
          setIsOpen(true);
        }}
        isOpen={isOpen}
        speaking={speaking}
      />
      {isOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black text-cyan-400/70">
              Chargement d&apos;A.V.A.…
            </div>
          }
        >
          <ImmersiveAvaScreen
            onClose={() => {
              setIsOpen(false);
              setIntentSignal(null);
              setNeedsConfirm(false);
            }}
            onSpeakingChange={setSpeaking}
            intentSignal={intentSignal}
            intentNeedsConfirm={needsConfirm}
            onIntentHandled={() => {
              setIntentSignal(null);
              setNeedsConfirm(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
