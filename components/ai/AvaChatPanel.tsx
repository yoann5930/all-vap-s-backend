"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, MicOff, Minimize2, Send, X } from "lucide-react";

export type AvaChatMessage = {
  id: string;
  role: "user" | "ava";
  text: string;
};

interface AvaChatPanelProps {
  open: boolean;
  messages: AvaChatMessage[];
  disabled?: boolean;
  sending?: boolean;
  thinking?: boolean;
  micAvailable?: boolean;
  micActive?: boolean;
  draft?: string;
  statusLabel?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSend: (text: string) => void | Promise<void>;
  onToggleMic?: () => void;
}

/**
 * Fenêtre de conversation A.V.A. — ouverte uniquement sur action utilisateur.
 * Ne gère pas le moteur IA : pure UI sur la même session conversationnelle.
 */
export function AvaChatPanel({
  open,
  messages,
  disabled = false,
  sending = false,
  thinking = false,
  micAvailable = false,
  micActive = false,
  draft,
  statusLabel,
  onClose,
  onMinimize,
  onSend,
  onToggleMic,
}: AvaChatPanelProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sendingLockRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (draft?.trim()) setText(draft.trim());
    const t = window.setTimeout(() => textareaRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [open, draft]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages, thinking, sending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        <motion.section
          key="ava-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Discussion avec A.V.A."
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] flex max-h-[min(92dvh,40rem)] flex-col border-t border-cyan-500/25 bg-black/90 shadow-[0_-12px_48px_rgba(0,212,255,0.1)] backdrop-blur-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-h-[min(78vh,36rem)] sm:w-[min(26rem,calc(100vw-2rem))] sm:rounded-2xl sm:border"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-cyan-500/15 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium tracking-wide text-cyan-100">
                Discussion avec A.V.A.
              </p>
              {statusLabel ? (
                <p className="truncate text-[11px] text-cyan-500/70" aria-live="polite">
                  {statusLabel}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onMinimize ? (
                <button
                  type="button"
                  onClick={onMinimize}
                  className="rounded-lg p-2 text-cyan-500/70 transition hover:bg-cyan-500/10 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
                  aria-label="Réduire la discussion"
                >
                  <Minimize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-cyan-500/70 transition hover:bg-cyan-500/10 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
                aria-label="Fermer la discussion"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-cyan-600/60">
                Posez votre question à A.V.A. — l’historique restera ici.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-md border border-cyan-400/25 bg-cyan-500/15 text-cyan-50"
                        : "rounded-bl-md border border-cyan-800/35 bg-cyan-950/45 text-cyan-100/90"
                    }`}
                  >
                    <span className="mb-0.5 block text-[10px] tracking-[0.12em] text-cyan-500/55 uppercase">
                      {m.role === "user" ? "Vous" : "A.V.A."}
                    </span>
                    {m.text}
                  </div>
                </div>
              ))
            )}
            {thinking || sending ? (
              <div className="flex items-center gap-2 px-1 text-xs text-cyan-400/70">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                <span>A.V.A. réfléchit…</span>
              </div>
            ) : null}
          </div>

          <footer className="shrink-0 border-t border-cyan-500/15 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-1.5">
              {micAvailable && onToggleMic ? (
                <button
                  type="button"
                  onClick={onToggleMic}
                  disabled={disabled}
                  aria-label={micActive ? "Arrêter l’écoute" : "Activer le micro"}
                  aria-pressed={micActive}
                  className={`mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50 disabled:opacity-35 ${
                    micActive
                      ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                      : "border-cyan-800/40 bg-cyan-950/40 text-cyan-500/70 hover:border-cyan-500/40 hover:text-cyan-200"
                  }`}
                >
                  {micActive ? (
                    <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <MicOff className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              ) : null}

              <label htmlFor="ava-chat-input" className="sr-only">
                Message à A.V.A.
              </label>
              <textarea
                id="ava-chat-input"
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={disabled || sending}
                placeholder="Votre message…"
                aria-label="Écrivez votre message à A.V.A."
                enterKeyHint="send"
                className="max-h-32 min-h-[2.85rem] flex-1 resize-none rounded-xl border border-cyan-500/20 bg-cyan-950/35 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-700/50 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 disabled:opacity-50"
              />

              <button
                type="button"
                onClick={() => void submit()}
                disabled={disabled || sending || !text.trim()}
                aria-label="Envoyer le message"
                className="mb-0.5 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50 disabled:opacity-35"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Envoyer
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-cyan-700/50">
              Entrée pour envoyer · Maj+Entrée nouvelle ligne · Échap pour fermer
            </p>
          </footer>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

interface AvaDiscussButtonProps {
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Bouton unique sous l’avatar — ouvre / rouvre la discussion. */
export function AvaDiscussButton({ open, disabled = false, onClick }: AvaDiscussButtonProps) {
  if (open) return null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Discuter avec A.V.A."
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className="relative inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-7 py-3 text-sm font-medium tracking-wide text-cyan-50 shadow-[0_0_32px_rgba(0,212,255,0.16)] backdrop-blur-sm transition hover:border-cyan-300/55 hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40"
    >
      Discuter avec A.V.A.
    </motion.button>
  );
}
