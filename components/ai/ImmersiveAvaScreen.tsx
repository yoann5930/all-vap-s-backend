"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Captions, CaptionsOff, Loader2, Send, X } from "lucide-react";
import Link from "next/link";
import { HolographicAvatar } from "@/components/ai/HolographicAvatar";
import { ImmersiveMic } from "@/components/ai/Voice";
import { Particles } from "@/components/ai/Particles";
import { AVA_GREETING_SHORT, toSpokenText, toSubtitle } from "@/lib/ai/ava-speech-utils";
import { useSpeech } from "@/hooks/useSpeech";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/utils";

interface ProductChip {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  promoPriceCents: number | null;
  isPromo: boolean;
  stock: number;
}

interface ImmersiveAvaScreenProps {
  onClose: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

type AvaState = "idle" | "listening" | "thinking" | "speaking";

export function ImmersiveAvaScreen({ onClose, onSpeakingChange }: ImmersiveAvaScreenProps) {
  const [subtitle, setSubtitle] = useState("");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [products, setProducts] = useState<ProductChip[]>([]);
  const [avaState, setAvaState] = useState<AvaState>("idle");
  const greetedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendRef = useRef<(text: string) => void>(() => {});

  const handleTranscript = useCallback((text: string) => {
    if (text.trim()) sendRef.current(text);
  }, []);

  const { isListening, isSpeaking, startListening, stopListening, speak, stopSpeaking } =
    useSpeech(handleTranscript);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const speaking = isSpeaking || processing;
    onSpeakingChange?.(speaking);
    setAvaState(isListening ? "listening" : isSpeaking ? "speaking" : processing ? "thinking" : "idle");
  }, [isListening, isSpeaking, processing, onSpeakingChange]);

  const respond = useCallback(
    (spoken: string, subs: string, prods: ProductChip[] = []) => {
      setSubtitle(subs);
      setProducts(prods);
      speak(spoken);
    },
    [speak]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await fetch("/api/ai-assistant");
      } catch {
        /* fallback greeting */
      }
      if (cancelled) return;
      setLoading(false);
      if (!greetedRef.current) {
        greetedRef.current = true;
        const greeting = AVA_GREETING_SHORT;
        setSubtitle(toSubtitle(greeting));
        speak(greeting);
      }
    }

    init();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [speak, stopSpeaking]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || processing || blocked) return;

      stopListening();
      setProcessing(true);
      setInput("");
      setProducts([]);

      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = await res.json();

        if (data.blocked) {
          setBlocked(true);
          respond(toSpokenText(data.content, 120), toSubtitle(data.content));
          return;
        }

        const spoken = toSpokenText(data.content);
        const subs = toSubtitle(data.content);
        const prods: ProductChip[] = (data.products ?? []).map(
          (p: ProductChip) => p
        );
        respond(spoken, prods.length ? `${subs} — ${prods.length} suggestion${prods.length > 1 ? "s" : ""}` : subs, prods);
      } catch {
        respond("Désolée, une erreur est survenue.", "Erreur de connexion");
      } finally {
        setProcessing(false);
      }
    },
    [processing, blocked, respond, stopListening]
  );

  sendRef.current = sendMessage;

  const handleMic = () => {
    if (processing || blocked || isSpeaking) return;
    if (isListening) stopListening();
    else startListening();
  };

  const handleFaceClick = () => {
    if (!isListening && !processing && !isSpeaking) handleMic();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const statusLabel =
    avaState === "listening"
      ? "Je vous écoute…"
      : avaState === "thinking"
        ? "Réflexion…"
        : avaState === "speaking"
          ? "A.V.A. parle"
          : "Appuyez sur le micro ou parlez-moi";

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="A.V.A. — interface immersive"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="ava-immersive fixed inset-0 z-[70] flex flex-col bg-black"
      >
        <Particles count={55} color="0, 212, 255" className="opacity-60" />

        <div className="ava-immersive-scan pointer-events-none absolute inset-0 opacity-[0.07]" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-[11px] font-medium tracking-[0.25em] text-cyan-500/50">A.V.A.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSubtitles((v) => !v)}
              className="rounded-full p-2 text-cyan-500/40 transition hover:bg-cyan-500/10 hover:text-cyan-400/70"
              aria-label={showSubtitles ? "Masquer les sous-titres" : "Afficher les sous-titres"}
            >
              {showSubtitles ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                stopListening();
                onClose();
              }}
              className="rounded-full p-2 text-cyan-500/40 transition hover:bg-white/5 hover:text-cyan-300/80"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Center — holographic face */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500/50" />
          ) : (
            <>
              <button
                type="button"
                onClick={handleFaceClick}
                className="ava-immersive-face group cursor-pointer focus:outline-none"
                aria-label="Activer le micro"
              >
                <HolographicAvatar
                  size="hero"
                  speaking={isSpeaking}
                  listening={isListening}
                  thinking={processing}
                  interactive
                  immersive
                />
              </button>

              <motion.p
                className="mt-6 text-[11px] tracking-wide text-cyan-500/40"
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                {statusLabel}
              </motion.p>

              <AnimatePresence mode="wait">
                {showSubtitles && subtitle && (
                  <motion.p
                    key={subtitle}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 max-w-md px-6 text-center text-xs leading-relaxed text-cyan-300/55 sm:text-sm"
                  >
                    {subtitle}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Minimal product chips */}
              {products.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex max-w-lg flex-wrap justify-center gap-2 px-4"
                >
                  {products.slice(0, 3).map((p) => {
                    const price = p.isPromo && p.promoPriceCents ? p.promoPriceCents : p.priceCents;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-950/30 px-3 py-1.5 backdrop-blur-sm"
                      >
                        <Link
                          href={`/boutique/${p.slug}`}
                          className="text-[11px] text-cyan-300/80 hover:text-cyan-200"
                        >
                          {p.name} · {formatPrice(price)}
                        </Link>
                        {p.stock > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              addToCart({
                                productId: p.id,
                                name: p.name,
                                slug: p.slug,
                                priceCents: price,
                              });
                              notifyCartUpdate();
                            }}
                            className="text-[10px] text-cyan-500/60 hover:text-cyan-400"
                            aria-label={`Ajouter ${p.name}`}
                          >
                            +
                          </button>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Bottom — mic + discreet input */}
        <div className="relative z-10 px-4 pb-6 pt-2 sm:pb-8">
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            <ImmersiveMic
              isListening={isListening}
              isSpeaking={isSpeaking}
              disabled={loading || processing || blocked}
              onToggle={handleMic}
            />

            {!blocked ? (
              <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ou écrivez ici…"
                  disabled={loading || processing}
                  className="flex-1 border-0 border-b border-cyan-900/60 bg-transparent px-1 py-2 text-center text-xs text-cyan-300/50 placeholder:text-cyan-900/80 focus:border-cyan-600/40 focus:text-cyan-300/70 focus:outline-none disabled:opacity-40"
                />
                {input.trim() && (
                  <button
                    type="submit"
                    disabled={processing}
                    className="text-cyan-500/40 transition hover:text-cyan-400/70 disabled:opacity-30"
                    aria-label="Envoyer"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
            ) : (
              <p className="text-[10px] text-gray-600">Réservé aux +18 ans</p>
            )}

            <p className="text-[9px] text-cyan-900/80">+18 · Pas de conseil médical</p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** @deprecated Use ImmersiveAvaScreen — kept for import compatibility */
export const AIAssistantChat = ImmersiveAvaScreen;
