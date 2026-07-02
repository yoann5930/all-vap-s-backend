"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Captions, CaptionsOff, Loader2, Send, X } from "lucide-react";
import Link from "next/link";
import { HolographicAvatar } from "@/components/ai/HolographicAvatar";
import { ImmersiveMic } from "@/components/ai/Voice";
import { Particles } from "@/components/ai/Particles";
import { AVA_GREETING_SHORT, toSpokenText, toSubtitle } from "@/lib/ai/ava-speech-utils";
import { deriveAvaState, useSpeech, type AvaVoiceState } from "@/hooks/useSpeech";
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

export function ImmersiveAvaScreen({ onClose, onSpeakingChange }: ImmersiveAvaScreenProps) {
  const [subtitle, setSubtitle] = useState("");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [products, setProducts] = useState<ProductChip[]>([]);
  const greetedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

  const handleTranscript = useCallback((text: string) => {
    if (text.trim()) sendRef.current(text);
  }, []);

  const {
    isListening,
    isSpeaking,
    canListen,
    canSpeak,
    interimTranscript,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearError,
  } = useSpeech(handleTranscript);

  const avaState: AvaVoiceState = deriveAvaState(isListening, isSpeaking, thinking);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    onSpeakingChange?.(isSpeaking);
  }, [isSpeaking, onSpeakingChange]);

  const respond = useCallback(
    (spoken: string, subs: string, prods: ProductChip[] = []) => {
      setSubtitle(subs);
      setProducts(prods);
      if (canSpeak) {
        speak(spoken);
      } else {
        setSubtitle(subs || spoken);
      }
    },
    [speak, canSpeak]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await fetch("/api/ai-assistant");
      } catch {
        /* fallback */
      }
      if (cancelled) return;
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [stopSpeaking]);

  useEffect(() => {
    if (loading || greetedRef.current) return;
    greetedRef.current = true;
    const greeting = AVA_GREETING_SHORT;
    setSubtitle(toSubtitle(greeting));
    if (canSpeak) speak(greeting);
  }, [loading, canSpeak, speak]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking || blocked || isSpeaking) return;

      stopListening();
      setThinking(true);
      setInput("");
      setProducts([]);
      clearError();

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
        const prods: ProductChip[] = data.products ?? [];
        respond(
          spoken,
          prods.length ? `${subs} — ${prods.length} suggestion${prods.length > 1 ? "s" : ""}` : subs,
          prods
        );
      } catch {
        respond("Désolée, une erreur est survenue.", "Erreur de connexion");
      } finally {
        setThinking(false);
      }
    },
    [thinking, blocked, isSpeaking, respond, stopListening, clearError]
  );

  sendRef.current = sendMessage;

  const handleMic = async () => {
    if (thinking || blocked || isSpeaking) return;
    clearError();
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  const handleFaceClick = () => {
    if (avaState === "idle") handleMic();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const statusLabel: Record<AvaVoiceState, string> = {
    listening: "Je vous écoute…",
    thinking: "Réflexion…",
    speaking: "A.V.A. répond",
    idle: canListen ? "Appuyez sur le micro pour parler" : "Écrivez votre question ci-dessous",
  };

  const liveCaption =
    isListening && interimTranscript
      ? interimTranscript
      : showSubtitles
        ? subtitle
        : "";

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="A.V.A. — interface vocale immersive"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="ava-immersive fixed inset-0 z-[70] flex flex-col bg-black"
      >
        <Particles count={55} color="0, 212, 255" className="opacity-60" />
        <div className="ava-immersive-scan pointer-events-none absolute inset-0 opacity-[0.07]" />

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

        {/* Face — centre */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-32">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500/50" />
          ) : (
            <>
              <button
                type="button"
                onClick={handleFaceClick}
                disabled={thinking || isSpeaking || blocked}
                className="ava-immersive-face group cursor-pointer focus:outline-none disabled:cursor-default"
                aria-label={canListen ? "Activer le micro" : "A.V.A."}
              >
                <HolographicAvatar state={avaState} size="hero" interactive immersive />
              </button>

              <motion.p
                className="mt-8 text-[11px] tracking-wide text-cyan-500/40"
                animate={{ opacity: [0.4, 0.75, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                {statusLabel[avaState]}
              </motion.p>

              {products.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex max-w-lg flex-wrap justify-center gap-2 px-4"
                >
                  {products.slice(0, 3).map((p) => {
                    const price = p.isPromo && p.promoPriceCents ? p.promoPriceCents : p.priceCents;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-full border border-cyan-500/15 bg-cyan-950/20 px-2.5 py-1"
                      >
                        <Link
                          href={`/boutique/${p.slug}`}
                          className="text-[10px] text-cyan-400/60 hover:text-cyan-300/80"
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
                            className="text-[10px] text-cyan-600/50 hover:text-cyan-400"
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

        {/* Bottom — micro + sous-titre discret + fallback texte */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-8 sm:pb-8">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent"
            aria-hidden
          />

          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
            <AnimatePresence mode="wait">
              {liveCaption && (
                <motion.p
                  key={liveCaption}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-w-sm px-4 text-center text-[11px] leading-relaxed text-cyan-400/45"
                >
                  {liveCaption}
                </motion.p>
              )}
            </AnimatePresence>

            {error && (
              <p className="text-center text-[10px] text-amber-500/70">{error}</p>
            )}

            {!canListen && !loading && (
              <p className="text-center text-[10px] text-cyan-600/50">
                Voix indisponible — utilisez le champ texte
              </p>
            )}

            {canListen && (
              <ImmersiveMic state={avaState} disabled={loading || blocked} onToggle={handleMic} />
            )}

            {!blocked && (
              <form onSubmit={handleSubmit} className="flex w-full items-center gap-2 opacity-60 focus-within:opacity-100">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={canListen ? "Ou écrivez ici…" : "Écrivez votre question…"}
                  disabled={loading || thinking || isSpeaking}
                  className="flex-1 border-0 border-b border-cyan-900/50 bg-transparent px-1 py-2 text-center text-xs text-cyan-400/40 placeholder:text-cyan-900/70 focus:border-cyan-700/50 focus:text-cyan-300/60 focus:outline-none disabled:opacity-30"
                />
                {input.trim() && (
                  <button
                    type="submit"
                    disabled={thinking || isSpeaking}
                    className="text-cyan-600/40 transition hover:text-cyan-400/60 disabled:opacity-20"
                    aria-label="Envoyer"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
            )}

            <p className="text-[9px] text-cyan-950">+18 · Pas de conseil médical</p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export const AIAssistantChat = ImmersiveAvaScreen;
