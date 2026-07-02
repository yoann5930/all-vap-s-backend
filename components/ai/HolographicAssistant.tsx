"use client";

import { useState } from "react";
import { AssistantButton } from "@/components/ai/AssistantButton";
import { ChatWindow } from "@/components/ai/ChatWindow";

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
        <ChatWindow
          onClose={() => setIsOpen(false)}
          onSpeakingChange={setSpeaking}
        />
      )}
    </>
  );
}
