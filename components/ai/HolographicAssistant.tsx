"use client";

import { useState } from "react";
import { AIAssistantButton } from "@/components/ai/AIAssistantButton";
import { AIAssistantChat } from "@/components/ai/AIAssistantChat";

export function HolographicAssistant() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AIAssistantButton onClick={() => setIsOpen((v) => !v)} isOpen={isOpen} />
      {isOpen && <AIAssistantChat onClose={() => setIsOpen(false)} />}
    </>
  );
}
