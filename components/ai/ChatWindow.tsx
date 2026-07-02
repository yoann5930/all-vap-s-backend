"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, ShieldAlert, X } from "lucide-react";
import { HolographicAvatar } from "@/components/ai/HolographicAvatar";
import { ProductSuggestionCard, type ProductSuggestion } from "@/components/ai/ProductSuggestionCard";
import { VoiceControls } from "@/components/ai/Voice";
import { Particles } from "@/components/ai/Particles";
import { AVA_GREETING } from "@/lib/ai/ava-constants";
import { useSpeech } from "@/hooks/useSpeech";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  products?: ProductSuggestion[];
}

interface ChatWindowProps {
  onClose: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

export function ChatWindow({ onClose, onSpeakingChange }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const handleVoiceTranscript = useCallback((text: string) => {
    if (text.trim()) sendMessageRef.current(text);
  }, []);

  const { speak } = useSpeech(handleVoiceTranscript);
  const sendMessageRef = useRef<(text: string) => void>(() => {});

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
        setSuggestions(data.suggestions ?? []);
        setIsLoggedIn(Boolean(data.isLoggedIn));
        setMessages([{ role: "assistant", content: data.message }]);
      } catch {
        if (!cancelled) {
          setMessages([{ role: "assistant", content: AVA_GREETING }]);
          setSuggestions(["E-liquide fruité", "Je débute", "Horaires boutique"]);
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

  useEffect(() => {
    onSpeakingChange?.(sending);
  }, [sending, onSpeakingChange]);

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
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();

      setSuggestions(data.suggestions ?? []);
      if (data.blocked) setBlocked(true);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.content,
        products: data.products,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (voiceEnabled && data.content) {
        speak(data.content.slice(0, 500));
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connexion interrompue. Réessayez dans un instant." },
      ]);
    } finally {
      setSending(false);
    }
  };

  sendMessageRef.current = sendMessage;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="A.V.A. — All Vap's Virtual Advisor"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="ava-chat-window fixed inset-x-2 bottom-2 z-[59] flex max-h-[min(82vh,680px)] flex-col overflow-hidden sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(440px,calc(100vw-1.5rem))]"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-black/75 shadow-[0_0_60px_rgba(0,212,255,0.15)] backdrop-blur-2xl">
          <Particles count={18} color="0, 212, 255" />

          {/* Header */}
          <div className="relative border-b border-cyan-500/20 bg-gradient-to-r from-black/90 via-cyan-950/30 to-black/90 px-4 py-3">
            <div className="ava-holo-scan absolute inset-0 opacity-20" />
            <div className="relative flex items-center gap-3">
              <HolographicAvatar speaking={sending} size="sm" interactive={false} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold tracking-wide text-cyan-300">A.V.A.</p>
                <p className="truncate text-[11px] text-cyan-400/60">
                  All Vap&apos;s Virtual Advisor · {isLoggedIn ? "Profil mémorisé" : "Mode invité"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-cyan-400/60 transition hover:bg-cyan-500/10 hover:text-cyan-300"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="relative flex-1 space-y-3 overflow-y-auto px-3 py-4 scrollbar-hide">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-cyan-400">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            ) : (
              messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[92%] ${
                      msg.role === "user"
                        ? "rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-600 to-cyan-700 px-3.5 py-2.5 text-sm text-white shadow-[0_4px_20px_rgba(0,180,220,0.3)]"
                        : "space-y-2"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="rounded-2xl rounded-bl-md border border-cyan-500/20 bg-black/60 px-3.5 py-2.5 text-sm leading-relaxed text-gray-100 backdrop-blur-sm">
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        {msg.products && msg.products.length > 0 && (
                          <div className="space-y-2">
                            {msg.products.map((p, idx) => (
                              <ProductSuggestionCard key={p.id} product={p} index={idx} />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))
            )}

            {sending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="rounded-2xl border border-cyan-500/20 bg-black/50 px-4 py-2.5">
                  <span className="inline-flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-cyan-400"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Suggestions */}
          {!loading && suggestions.length > 0 && !blocked && (
            <div className="flex flex-wrap gap-1.5 border-t border-cyan-500/15 px-3 py-2">
              {suggestions.map((s) => (
                <motion.button
                  key={s}
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => sendMessage(s)}
                  disabled={sending}
                  className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-cyan-500/15 bg-black/60 px-3 py-2.5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-start gap-1.5 text-[10px] leading-tight text-cyan-400/45">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                <span>+18 ans · Pas de conseil médical · Vente réservée aux majeurs</span>
              </div>
              <VoiceControls
                onTranscript={handleVoiceTranscript}
                lastAssistantMessage={lastAssistant?.content}
                voiceEnabled={voiceEnabled}
                onToggleVoice={() => setVoiceEnabled((v) => !v)}
                disabled={sending || loading || blocked}
              />
            </div>

            {!blocked ? (
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Posez votre question à A.V.A…"
                  disabled={sending || loading}
                  className="flex-1 rounded-xl border border-cyan-500/25 bg-black/70 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 disabled:opacity-50"
                />
                <motion.button
                  type="submit"
                  disabled={!input.trim() || sending || loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-[0_0_20px_rgba(0,212,255,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </form>
            ) : (
              <p className="py-2 text-center text-xs text-gray-500">Session terminée — réservé aux +18 ans.</p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
