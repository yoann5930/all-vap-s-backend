"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Send, X, Mic } from "lucide-react";

interface AvaKeyboardButtonProps {
  primary?: boolean;
  disabled?: boolean;
  open?: boolean;
  onClick: () => void;
}

/** Icône clavier discrète (ou principale si pas de micro). Toujours cliquable pour ouvrir/fermer. */
export function AvaKeyboardButton({
  primary = false,
  disabled = false,
  open = false,
  onClick,
}: AvaKeyboardButtonProps) {
  const label = open ? "Fermer la saisie au clavier" : "Ouvrir la saisie au clavier";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={open}
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      className={`relative flex items-center justify-center rounded-full border backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-35 ${
        primary
          ? "h-[4.5rem] w-[4.5rem] border-cyan-500/35 bg-cyan-950/40 text-cyan-300/85 shadow-[0_0_28px_rgba(0,212,255,0.18)] hover:border-cyan-400/55 hover:text-cyan-100"
          : open
            ? "h-11 w-11 border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
            : "h-11 w-11 border-cyan-800/30 bg-cyan-950/25 text-cyan-500/55 hover:border-cyan-500/40 hover:text-cyan-300/80"
      }`}
    >
      <Keyboard className={primary ? "h-7 w-7" : "h-5 w-5"} strokeWidth={1.5} aria-hidden />
    </motion.button>
  );
}

interface AvaKeyboardPanelProps {
  open: boolean;
  disabled?: boolean;
  sending?: boolean;
  showReturnToVoice?: boolean;
  onClose: () => void;
  onReturnToVoice?: () => void;
  onSend: (text: string) => void | Promise<void>;
}

/** Champ de saisie conversationnel — masqué tant que `open` est false. */
export function AvaKeyboardPanel({
  open,
  disabled = false,
  sending = false,
  showReturnToVoice = false,
  onClose,
  onReturnToVoice,
  onSend,
}: AvaKeyboardPanelProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingLockRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setText("");
      sendingLockRef.current = false;
      return;
    }
    const t = window.setTimeout(() => textareaRef.current?.focus(), 160);
    return () => window.clearTimeout(t);
  }, [open]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending || sendingLockRef.current) return;
    sendingLockRef.current = true;
    setText("");
    try {
      await onSend(trimmed);
    } finally {
      sendingLockRef.current = false;
      requestAnimationFrame(() => {
        if (open) textareaRef.current?.focus();
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="ava-keyboard-panel"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-[min(100vw-2rem,22rem)]"
        >
          <div className="rounded-2xl border border-cyan-500/25 bg-black/70 p-2 shadow-[0_0_28px_rgba(0,212,255,0.08)] backdrop-blur-md">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="text-[10px] tracking-[0.14em] text-cyan-500/50 uppercase">
                Écrire à A.V.A.
              </p>
              <div className="flex items-center gap-1">
                {showReturnToVoice && onReturnToVoice && (
                  <button
                    type="button"
                    onClick={onReturnToVoice}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-cyan-400/60 transition hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
                    aria-label="Retour à la voix"
                  >
                    <Mic className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                    Retour à la voix
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1 text-cyan-600/45 transition hover:text-cyan-300/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
                  aria-label="Fermer la saisie au clavier"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex items-end gap-1.5">
              <label htmlFor="ava-keyboard-input" className="sr-only">
                Écrivez votre demande à A.V.A.
              </label>
              <textarea
                id="ava-keyboard-input"
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={disabled || sending}
                placeholder="Votre message…"
                aria-label="Écrivez votre demande à A.V.A."
                enterKeyHint="send"
                className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-cyan-500/20 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-700/50 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={disabled || sending || !text.trim()}
                aria-label="Envoyer"
                className="mb-0.5 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50 disabled:opacity-35"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Envoyer
              </button>
            </div>
            <p className="mt-1 px-1 text-[9px] text-cyan-700/45">
              Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
