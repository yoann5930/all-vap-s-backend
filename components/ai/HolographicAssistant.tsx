"use client";

import { useState } from "react";
import { AssistantButton } from "@/components/ai/AssistantButton";
import { ImmersiveAvaScreen } from "@/components/ai/ImmersiveAvaScreen";

export function HolographicAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  return (
    <>
      <AssistantButton
        onClick={() => setIsOpen(true)}
        isOpen={isOpen}
        speaking={speaking}
      />
      {isOpen && (
        <ImmersiveAvaScreen
          onClose={() => setIsOpen(false)}
          onSpeakingChange={setSpeaking}
        />
      )}
    </>
  );
}
