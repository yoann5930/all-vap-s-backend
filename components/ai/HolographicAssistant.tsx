"use client";

import { useEffect, useState } from "react";
import { AssistantButton } from "@/components/ai/AssistantButton";
import { ImmersiveAvaScreen } from "@/components/ai/ImmersiveAvaScreen";
import { AVA_OPEN_EVENT, type PendingAvaIntent } from "@/lib/ava/quick-actions";

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
      )}
    </>
  );
}
