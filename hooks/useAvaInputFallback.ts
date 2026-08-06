"use client";

import { useCallback, useState } from "react";

/**
 * Bascule voix ↔ texte dans une seule conversation.
 */
export function useAvaInputFallback(initialTextOpen = true) {
  const [textOpen, setTextOpen] = useState(initialTextOpen);
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(
    null
  );

  const openText = useCallback(() => setTextOpen(true), []);
  const closeText = useCallback(() => setTextOpen(false), []);

  const askConfirm = useCallback((transcript: string) => {
    setPendingConfirmation(transcript);
  }, []);

  const clearConfirm = useCallback(() => setPendingConfirmation(null), []);

  return {
    textOpen,
    setTextOpen,
    openText,
    closeText,
    pendingConfirmation,
    askConfirm,
    clearConfirm,
  };
}
