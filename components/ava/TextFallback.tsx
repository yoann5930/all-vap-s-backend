"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

type Props = {
  disabled?: boolean;
  sending?: boolean;
  /** Préremplir (ex. correction de transcription) */
  draft?: string;
  /** Toujours monté — pas besoin d'ouvrir un panneau */
  autoFocus?: boolean;
  placeholder?: string;
  onSend: (text: string) => void | Promise<void>;
  onTyping?: () => void;
  className?: string;
};

/** Champ texte toujours disponible (voix + clavier, une seule conversation). */
export function TextFallback({
  disabled = false,
  sending = false,
  draft,
  autoFocus = false,
  placeholder = "Écrivez votre message…",
  onSend,
  onTyping,
  className = "",
}: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (draft !== undefined) {
      setText(draft);
    }
  }, [draft]);

  useEffect(() => {
    if (autoFocus) {
      const t = window.setTimeout(() => ref.current?.focus(), 200);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus, draft]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending || lock.current) return;
    lock.current = true;
    setText("");
    try {
      await onSend(trimmed);
    } finally {
      lock.current = false;
      requestAnimationFrame(() => ref.current?.focus());
    }
  }

  return (
    <div
      className={`w-[min(100vw-2rem,24rem)] ${className}`}
      role="form"
      aria-label="Écrire à AVA"
    >
      <div className="flex items-end gap-1.5 rounded-2xl border border-cyan-500/25 bg-black/70 p-2 shadow-[0_0_28px_rgba(0,212,255,0.08)] backdrop-blur-md">
        <label htmlFor="ava-text-fallback" className="sr-only">
          Écrivez votre demande à AVA
        </label>
        <textarea
          id="ava-text-fallback"
          ref={ref}
          value={text}
          rows={2}
          disabled={disabled || sending}
          placeholder={placeholder}
          enterKeyHint="send"
          aria-label="Écrivez votre demande à AVA"
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-cyan-500/20 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-700/50 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || sending || !text.trim()}
          aria-label="Envoyer le message"
          className="mb-0.5 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50 disabled:opacity-35"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Envoyer
        </button>
      </div>
      <p className="mt-1 px-1 text-center text-[9px] text-cyan-700/45">
        Vous pouvez répondre à l&apos;oral ou par écrit, comme vous préférez.
      </p>
    </div>
  );
}
