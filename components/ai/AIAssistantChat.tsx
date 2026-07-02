"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { HolographicAvatar } from "@/components/ai/HolographicAvatar";
import { MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  products?: Array<{ name: string; slug: string; reason: string }>;
}

interface AIAssistantChatProps {
  onClose: () => void;
}

export function AIAssistantChat({ onClose }: AIAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/ai-assistant");
        const data = await res.json();
        if (cancelled) return;
        setStep(data.step ?? 0);
        setSuggestions(data.suggestions ?? []);
        setIsLoggedIn(Boolean(data.isLoggedIn));
        setMessages([{ role: "assistant", content: data.message }]);
      } catch {
        if (!cancelled) {
          setMessages([
            {
              role: "assistant",
              content:
                "Bonjour ! Je suis votre conseiller All Vap's. Confirmez-vous avoir 18 ans ou plus ? " + MEDICAL_DISCLAIMER,
            },
          ]);
          setSuggestions(["Oui, j'ai 18 ans ou plus", "Non"]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!loading && !blocked) inputRef.current?.focus();
  }, [loading, blocked]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || blocked) return;

    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, step }),
      });
      const data = await res.json();

      setStep(data.step ?? step);
      setSuggestions(data.suggestions ?? []);
      if (data.blocked) setBlocked(true);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content,
          products: data.products,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Une erreur est survenue. Réessayez dans un instant." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const isSpeaking = sending || loading;

  return (
    <div
      role="dialog"
      aria-label="Assistant IA All Vap's"
      className="fixed inset-x-3 bottom-[4.5rem] z-[59] flex max-h-[min(78vh,640px)] flex-col overflow-hidden rounded-2xl border border-brand-500/30 bg-vap-black/95 shadow-[0_0_40px_rgba(16,185,129,0.2)] backdrop-blur-xl animate-slide-down sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[min(420px,calc(100vw-2rem))]"
    >
      <div className="relative border-b border-brand-500/20 bg-gradient-to-r from-vap-charcoal to-vap-black px-4 py-4">
        <div className="holo-scan absolute inset-0 opacity-30" />
        <div className="relative flex items-center gap-3">
          <HolographicAvatar speaking={isSpeaking} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-300">Conseiller All Vap&apos;s</p>
            <p className="truncate text-xs text-brand-400/70">
              {isLoggedIn ? "Profil mémorisé" : "Connectez-vous pour mémoriser vos goûts"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-brand-400/70 transition hover:bg-brand-500/10 hover:text-brand-300"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-brand-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand-600/90 text-white"
                    : "border border-brand-500/20 bg-vap-charcoal/80 text-gray-100"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.products && msg.products.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-brand-500/20 pt-2">
                    {msg.products.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/boutique/${p.slug}`}
                          className="text-brand-300 underline-offset-2 hover:text-brand-200 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="ml-1 text-xs text-brand-400/60">— {p.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-brand-500/20 bg-vap-charcoal/80 px-3 py-2 text-sm text-brand-400">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse animation-delay-100">●</span>
                <span className="animate-pulse animation-delay-200">●</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {!loading && suggestions.length > 0 && !blocked && (
        <div className="flex flex-wrap gap-2 border-t border-brand-500/15 px-4 py-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              disabled={sending}
              className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-300 transition hover:border-brand-400/50 hover:bg-brand-500/20 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-brand-500/15 px-3 py-2">
        <div className="mb-2 flex items-start gap-1.5 text-[10px] leading-tight text-brand-400/50">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span>+18 ans · Pas de conseil médical · Vente réservée aux majeurs</span>
        </div>

        {!blocked ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Votre réponse..."
              disabled={sending || loading}
              className="flex-1 rounded-xl border border-brand-500/25 bg-vap-charcoal/80 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || loading}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <p className="py-2 text-center text-xs text-gray-400">Session terminée — réservé aux +18 ans.</p>
        )}
      </div>

      {lastAssistant && !loading && (
        <span className="sr-only" aria-live="polite">
          {lastAssistant.content}
        </span>
      )}
    </div>
  );
}
