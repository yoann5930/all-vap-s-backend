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
}

interface AvaReplyPayload {
  subtitle: string;
  spoken: string;
  products: AvaProduct[];
  audioBase64?: string | null;
  audioMime?: string;
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
      spoken: toSpokenText(data.content),
      products: data.products ?? [],
      audioBase64: data.audioBase64 ?? null,
      audioMime: data.audioMime ?? "audio/mpeg",
      blocked: Boolean(data.blocked),
    };
  }, []);

  const respond = useCallback(
    (reply: AvaReplyPayload) => {
      setSubtitle(reply.subtitle);
      setProducts(reply.products);
      synthesis.speak(reply.spoken, reply.audioBase64, reply.audioMime);
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
      await fetch("/api/ai-assistant");
    } catch {
      /* ok */
    }
    setReady(true);
  }, []);

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
    synthesis.speak("Bonjour, je suis A.V.A., votre conseillère All Vap's.");
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
      return "A.V.A. réfléchit…";
    case "speaking":
      return "A.V.A. parle…";
    default:
      return "";
  }
}
