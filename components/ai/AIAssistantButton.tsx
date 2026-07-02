"use client";

import { Bot, X } from "lucide-react";

interface AIAssistantButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export function AIAssistantButton({ onClick, isOpen }: AIAssistantButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? "Fermer l'assistant IA" : "Ouvrir l'assistant IA"}
      className="group fixed bottom-5 right-4 z-[60] flex items-center gap-2 rounded-full border border-brand-500/40 bg-vap-black/95 px-4 py-3 text-sm font-medium text-brand-300 shadow-[0_0_24px_rgba(16,185,129,0.25)] backdrop-blur-md transition-all duration-300 hover:border-brand-400 hover:shadow-[0_0_32px_rgba(16,185,129,0.45)] sm:bottom-6 sm:right-6"
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 ring-1 ring-brand-400/30">
        <span className="absolute inset-0 rounded-full holo-pulse opacity-70" />
        {isOpen ? (
          <X className="relative h-4 w-4 text-brand-300" />
        ) : (
          <Bot className="relative h-4 w-4 text-brand-300" />
        )}
      </span>
      <span className="hidden sm:inline">Assistant IA</span>
      <span className="sm:hidden">IA</span>
    </button>
  );
}
