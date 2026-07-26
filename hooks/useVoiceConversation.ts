"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toSpokenText, toSubtitle } from "@/lib/ai/ava-speech-utils";
import { MIC_MESSAGES } from "@/lib/ai/mic-permission";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

export type AvaConversationState = "idle" | "listening" | "thinking" | "speaking";

export interface AvaProduct {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  promoPriceCents: number | null;
  isPromo: boolean;
  stock: number;
  imageUrl?: string | null;
  description?: string | null;
  reason?: string;
  nicotine?: string | null;
  pgVg?: string | null;
  volume?: string | null;
}

interface AvaReplyPayload {
  subtitle: string;
  spoken: string;
  products: AvaProduct[];
  blocked?: boolean;
}

export function useVoiceConversation() {
  const [thinking, setThinking] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [products, setProducts] = useState<AvaProduct[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const greetedRef = useRef(false);

  const synthesis = useSpeechSynthesis();
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const recognition = useSpeechRecognition((text) => {
    void sendRef.current(text);
  });

  const askApi = useCallback(async (message: string): Promise<AvaReplyPayload> => {
    const res = await fetch("/api/ai-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    return {
      subtitle: toSubtitle(data.content),
      spoken: toSpokenText(data.spoken ?? data.content ?? ""),
      products: (data.products ?? []).map((p: AvaProduct & { imageUrl?: string | null }) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        priceCents: p.priceCents,
        promoPriceCents: p.promoPriceCents ?? null,
        isPromo: Boolean(p.isPromo),
        stock: p.stock,
        imageUrl: p.imageUrl ?? null,
        description: p.description ?? null,
        reason: p.reason ?? "catalogue",
        nicotine: p.nicotine ?? null,
        pgVg: p.pgVg ?? null,
        volume: p.volume ?? null,
      })),
      blocked: Boolean(data.blocked),
    };
  }, []);

  const respond = useCallback(
    (reply: AvaReplyPayload) => {
      setSubtitle(reply.subtitle);
      setProducts(reply.products);
      // Voix gratuite uniquement (speechSynthesis) — jamais d’audio OpenAI
      synthesis.speak(reply.spoken);
    },
    [synthesis]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking || blocked || synthesis.isSpeaking) return;

      recognition.stopListening();
      recognition.clearError();
      setThinking(true);
      setProducts([]);

      try {
        const reply = await askApi(trimmed);
        if (reply.blocked) setBlocked(true);
        respond(reply);
      } catch {
        respond({
          subtitle: "Connexion interrompue",
          spoken: "Désolée, une erreur est survenue.",
          products: [],
        });
      } finally {
        setThinking(false);
      }
    },
    [thinking, blocked, synthesis.isSpeaking, recognition, askApi, respond]
  );

  sendRef.current = sendMessage;

  const avaState: AvaConversationState = recognition.isListening
    ? "listening"
    : thinking
      ? "thinking"
      : synthesis.isSpeaking
        ? "speaking"
        : "idle";

  const init = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-assistant");
      const data = await res.json().catch(() => null);
      if (data?.greeting && !greetedRef.current) {
        greetedRef.current = true;
        const spoken =
          data.greeting.spoken ||
          data.greeting.content ||
          "Bonjour, je m'appelle Ava. Que recherchez-vous ?";
        synthesis.speak(spoken);
      }
    } catch {
      /* ok */
    }
    setReady(true);
  }, [synthesis]);

  const activateMic = useCallback(async () => {
    if (blocked || thinking || synthesis.isSpeaking) return;
    recognition.clearError();
    setShowSettingsHelp(false);
    if (recognition.isListening) {
      recognition.stopListening();
    } else {
      await recognition.startListening();
    }
  }, [blocked, thinking, synthesis.isSpeaking, recognition]);

  const toggleMic = activateMic;

  const stopAll = useCallback(() => {
    recognition.stopListening();
    synthesis.stopSpeaking();
    setThinking(false);
    setShowSettingsHelp(false);
  }, [recognition, synthesis]);

  useEffect(() => {
    if (!ready || greetedRef.current || !synthesis.canSpeak) return;
    greetedRef.current = true;
    synthesis.speak("Bonjour, je m'appelle Ava. Que recherchez-vous ?");
  }, [ready, synthesis]);

  const needsTextFallback =
    !recognition.canListen || recognition.micPermission === "unsupported";

  return {
    avaState,
    subtitle,
    products,
    blocked,
    ready,
    error: recognition.error || synthesis.error,
    canListen: recognition.canListen,
    canSpeak: synthesis.canSpeak,
    interimTranscript: recognition.interimTranscript,
    micPermission: recognition.micPermission,
    isPromptingMic: recognition.isPrompting,
    showSettingsHelp,
    setShowSettingsHelp,
    needsTextFallback,
    init,
    toggleMic,
    activateMic,
    stopAll,
    sendMessage,
    isSpeaking: synthesis.isSpeaking,
    activeAudio: synthesis.activeAudio,
  };
}

export function avaStatusLabel(state: AvaConversationState, isPrompting = false): string {
  if (isPrompting) return MIC_MESSAGES.prompt;
  switch (state) {
    case "listening":
      return MIC_MESSAGES.listening;
    case "thinking":
      return "AVA réfléchit…";
    case "speaking":
      return "AVA parle…";
    default:
      return "";
  }
}
