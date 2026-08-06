"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toSpokenText, toSubtitle } from "@/lib/ai/ava-speech-utils";
import { MIC_MESSAGES } from "@/lib/ai/mic-permission";
import { AVA_VOICE_CONFIG } from "@/lib/ai/ava/config";
import type { AvaConversationContext } from "@/lib/ai/ava/types";
import { emptyConversationContext } from "@/lib/ai/ava/types";
import { needsConfirmation } from "@/lib/ava/transcription-confidence";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

export type AvaVoiceState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "LISTENING"
  | "USER_SPEAKING"
  | "WAITING_FOR_END_OF_SPEECH"
  | "PROCESSING"
  | "AVA_SPEAKING"
  | "RESUMING_LISTENING"
  | "PAUSED"
  | "ERROR";

/** Alias compat UI existante */
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
  variantId?: string | null;
}

interface AvaReplyPayload {
  subtitle: string;
  spoken: string;
  products: AvaProduct[];
  blocked?: boolean;
  conversationContext?: AvaConversationContext | null;
  hardwareAssistance?: {
    phase: string;
    showMediaUploader: boolean;
    showDeviceConfirmation: boolean;
    photoButtons?: Array<{ id: string; label: string }>;
    candidates: Array<{
      manufacturer: string;
      model: string;
      modelSlug: string;
      imageUrl: string | null;
      distinguishingFeatures: string[];
    }>;
    deviceContext: unknown;
    diagnosticSession?: unknown;
  } | null;
}

function mapUiState(voice: AvaVoiceState): AvaConversationState {
  switch (voice) {
    case "LISTENING":
    case "USER_SPEAKING":
    case "WAITING_FOR_END_OF_SPEECH":
    case "RESUMING_LISTENING":
      return "listening";
    case "PROCESSING":
    case "REQUESTING_PERMISSION":
      return "thinking";
    case "AVA_SPEAKING":
      return "speaking";
    default:
      return "idle";
  }
}

const CTX_KEY = "allvaps_ava_conversation_ctx";

function loadCtx(): AvaConversationContext {
  if (typeof window === "undefined") return emptyConversationContext();
  try {
    const raw = sessionStorage.getItem(CTX_KEY);
    if (!raw) return emptyConversationContext();
    return { ...emptyConversationContext(), ...JSON.parse(raw) };
  } catch {
    return emptyConversationContext();
  }
}

function saveCtx(ctx: AvaConversationContext | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      sessionStorage.removeItem(CTX_KEY);
      return;
    }
    sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function useVoiceConversation() {
  const [voiceState, setVoiceState] = useState<AvaVoiceState>("IDLE");
  const [subtitle, setSubtitle] = useState("");
  const [products, setProducts] = useState<AvaProduct[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [hardwareAssistance, setHardwareAssistance] = useState<
    AvaReplyPayload["hardwareAssistance"]
  >(null);
  const greetedRef = useRef(false);
  const conversationActiveRef = useRef(false);
  const ignoreResultsRef = useRef(false);
  const turnLockRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ctxRef = useRef<AvaConversationContext>(emptyConversationContext());
  const echoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUserSpokeRef = useRef<(() => void) | null>(null);
  const recognitionApiRef = useRef<{
    stopListening: () => void;
  } | null>(null);

  const synthesis = useSpeechSynthesis();
  const sendRef = useRef<
    (text: string, options?: { speak?: boolean; resumeListening?: boolean }) => Promise<void>
  >(async () => {});

  const voiceStateRef = useRef<AvaVoiceState>("IDLE");
  voiceStateRef.current = voiceState;

  const recognition = useSpeechRecognition(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Transcription incertaine : confirmer avant envoi (diagnostic sensible)
      if (needsConfirmation(trimmed)) {
        setPendingConfirm(trimmed);
        ignoreResultsRef.current = true;
        recognitionApiRef.current?.stopListening();
        setVoiceState("PAUSED");
        ignoreResultsRef.current = false;
        return;
      }
      onUserSpokeRef.current?.();
      void sendRef.current(trimmed);
    },
    {
      continuous: AVA_VOICE_CONFIG.continuousMode,
      speechEndSilenceMs: AVA_VOICE_CONFIG.speechEndSilenceMs,
      maxUserPauseMs: AVA_VOICE_CONFIG.maxUserPauseMs,
      shouldIgnoreResults: () => ignoreResultsRef.current || !conversationActiveRef.current,
      shouldAutoRestart: () => {
        const s = voiceStateRef.current;
        return (
          conversationActiveRef.current &&
          !ignoreResultsRef.current &&
          s !== "PAUSED" &&
          s !== "IDLE" &&
          s !== "ERROR" &&
          s !== "AVA_SPEAKING" &&
          s !== "PROCESSING"
        );
      },
    }
  );
  recognitionApiRef.current = recognition;

  // Sync USER_SPEAKING
  useEffect(() => {
    if (!conversationActiveRef.current) return;
    if (voiceState === "PROCESSING" || voiceState === "AVA_SPEAKING") return;
    if (recognition.userSpeaking && voiceState === "LISTENING") {
      setVoiceState("USER_SPEAKING");
    } else if (
      !recognition.userSpeaking &&
      recognition.isListening &&
      (voiceState === "USER_SPEAKING" || voiceState === "WAITING_FOR_END_OF_SPEECH")
    ) {
      setVoiceState("WAITING_FOR_END_OF_SPEECH");
    } else if (recognition.isListening && voiceState === "RESUMING_LISTENING") {
      setVoiceState("LISTENING");
    }
  }, [recognition.userSpeaking, recognition.isListening, voiceState]);

  const askApi = useCallback(async (message: string): Promise<AvaReplyPayload> => {
    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    let preferredStoreId: string | null = null;
    try {
      const { getPreferredStoreId } = await import("@/lib/stores/preferred-store");
      preferredStoreId = getPreferredStoreId();
    } catch {
      /* ignore */
    }

    const FRIENDLY =
      "Je rencontre un petit problème pour afficher les résultats. Je réessaie tout de suite.";

    const parseReply = (data: Record<string, unknown>): AvaReplyPayload => {
      if (data.conversationContext && typeof data.conversationContext === "object") {
        ctxRef.current = data.conversationContext as AvaConversationContext;
        saveCtx(ctxRef.current);
      }
      const content =
        typeof data.content === "string" && data.content.trim()
          ? data.content
          : FRIENDLY;
      const productsRaw = Array.isArray(data.products) ? data.products : [];
      return {
        subtitle: toSubtitle(content),
        spoken: toSpokenText(
          (typeof data.spoken === "string" && data.spoken) || content
        ),
        products: productsRaw.map((p: AvaProduct & { imageUrl?: string | null }) => ({
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
          variantId: p.variantId ?? null,
        })),
        blocked: Boolean(data.blocked),
        conversationContext: (data.conversationContext as AvaConversationContext) ?? null,
        hardwareAssistance:
          data.hardwareAssistance && typeof data.hardwareAssistance === "object"
            ? (data.hardwareAssistance as AvaReplyPayload["hardwareAssistance"])
            : null,
      };
    };

    const doFetch = async (clearCtx: boolean) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message,
            preferredStoreId,
            conversationContext: clearCtx ? null : ctxRef.current,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok && !data.content) {
          throw new Error(`ava_http_${res.status}`);
        }
        return parseReply(data);
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      return await doFetch(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.error("[ava] askApi failed, retry", err);
      try {
        saveCtx(null);
        ctxRef.current = emptyConversationContext();
        return await doFetch(true);
      } catch (err2) {
        console.error("[ava] askApi retry failed", err2);
        return {
          subtitle: toSubtitle(FRIENDLY),
          spoken: FRIENDLY,
          products: [],
        };
      }
    }
  }, []);

  const resumeListeningAfterTts = useCallback(async () => {
    if (!conversationActiveRef.current || blocked) {
      setVoiceState("IDLE");
      return;
    }
    setVoiceState("RESUMING_LISTENING");
    ignoreResultsRef.current = true;
    if (echoTimerRef.current) clearTimeout(echoTimerRef.current);
    await new Promise<void>((resolve) => {
      echoTimerRef.current = setTimeout(resolve, AVA_VOICE_CONFIG.postTtsEchoDelayMs);
    });
    ignoreResultsRef.current = false;
    recognition.releaseProcessingLock();
    const ok = await recognition.startListening();
    setVoiceState(ok ? "LISTENING" : "PAUSED");
  }, [blocked, recognition]);

  const respond = useCallback(
    async (reply: AvaReplyPayload, options?: { speak?: boolean; resumeListening?: boolean }) => {
      const shouldSpeak = options?.speak !== false;
      // Par défaut : reprendre l’écoute après TTS. Mode accessibilité : resumeListening false.
      const shouldResume = options?.resumeListening !== false;
      setSubtitle(reply.subtitle);
      setProducts(reply.products);
      setHardwareAssistance(reply.hardwareAssistance ?? null);
      ignoreResultsRef.current = true;
      recognition.stopListening();

      if (shouldSpeak) {
        setVoiceState("AVA_SPEAKING");
        await synthesis.speak(reply.spoken);
      }

      ignoreResultsRef.current = false;
      if (
        shouldResume &&
        conversationActiveRef.current &&
        AVA_VOICE_CONFIG.autoResumeListening
      ) {
        if (shouldSpeak) {
          await resumeListeningAfterTts();
        } else {
          conversationActiveRef.current = true;
          setVoiceState("RESUMING_LISTENING");
          const ok = await recognition.startListening();
          setVoiceState(ok ? "LISTENING" : "PAUSED");
        }
      } else {
        setVoiceState(conversationActiveRef.current ? "PAUSED" : "IDLE");
      }
    },
    [recognition, synthesis, resumeListeningAfterTts]
  );

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { speak?: boolean; resumeListening?: boolean }
    ) => {
      const trimmed = text.trim();
      if (!trimmed || blocked) return;
      if (turnLockRef.current) return;
      turnLockRef.current = true;

      ignoreResultsRef.current = true;
      recognition.stopListening();
      recognition.clearError();
      setVoiceState("PROCESSING");
      setProducts([]);

      try {
        const reply = await askApi(trimmed);
        if (reply.blocked) {
          setBlocked(true);
          conversationActiveRef.current = false;
        }
        await respond(reply, options);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[ava] sendMessage error", err);
        await respond(
          {
            subtitle: "Un instant…",
            spoken:
              "Je rencontre un petit problème. Je réessaie — vous pouvez aussi reformuler ou écrire votre demande.",
            products: [],
          },
          options
        );
      } finally {
        turnLockRef.current = false;
        recognition.releaseProcessingLock();
      }
    },
    [blocked, recognition, askApi, respond]
  );

  sendRef.current = sendMessage;

  const avaState = mapUiState(voiceState);

  const init = useCallback(async (options?: { skipGreeting?: boolean }) => {
    ctxRef.current = loadCtx();
    // UI utilisable immédiatement (clavier), indépendamment du réseau / TTS
    setReady(true);

    const skipGreeting = Boolean(options?.skipGreeting) || Boolean(ctxRef.current.turn > 0);

    if (skipGreeting) {
      greetedRef.current = true;
      conversationActiveRef.current = !blocked;
      if (!blocked && recognition.canListen) {
        try {
          const { queryMicPermission } = await import("@/lib/ai/mic-permission");
          const status = await queryMicPermission();
          if (status === "granted" || status === "unknown") {
            setVoiceState("RESUMING_LISTENING");
            const ok = await recognition.startListening();
            setVoiceState(ok ? "LISTENING" : "PAUSED");
          }
        } catch {
          setVoiceState("PAUSED");
        }
      } else {
        setVoiceState("IDLE");
      }
      return;
    }

    let spoken =
      "Bonjour, je m'appelle Ava. Comment puis-je vous aider aujourd'hui ?";
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      const res = await fetch("/api/ai-assistant", { signal: ac.signal });
      clearTimeout(timer);
      const data = await res.json().catch(() => null);
      if (data?.greeting?.spoken || data?.greeting?.content || data?.message) {
        spoken =
          data.greeting?.spoken ||
          data.greeting?.content ||
          data.message ||
          spoken;
      }
    } catch (err) {
      console.error("[ava] init greeting fetch failed", err);
    }

    setSubtitle(spoken);

    if (!greetedRef.current) {
      greetedRef.current = true;
      ignoreResultsRef.current = true;
      setVoiceState("AVA_SPEAKING");
      try {
        await Promise.race([
          synthesis.speak(spoken),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]);
      } catch {
        /* ok */
      }
      ignoreResultsRef.current = false;
    }

    // Cycle conversationnel : si le micro est déjà autorisé, écouter tout de suite
    if (!blocked && recognition.canListen) {
      try {
        const { queryMicPermission } = await import("@/lib/ai/mic-permission");
        const status = await queryMicPermission();
        if (status === "granted" || status === "unknown") {
          conversationActiveRef.current = true;
          setVoiceState("RESUMING_LISTENING");
          const ok = await recognition.startListening();
          setVoiceState(ok ? "LISTENING" : "PAUSED");
        } else {
          conversationActiveRef.current = true;
          setVoiceState("PAUSED");
        }
      } catch {
        conversationActiveRef.current = true;
        setVoiceState("PAUSED");
      }
    } else {
      conversationActiveRef.current = true;
      setVoiceState("IDLE");
    }
  }, [blocked, recognition, synthesis]);

  const clearDiagnosticSession = useCallback(() => {
    ctxRef.current = {
      ...ctxRef.current,
      diagnosticSession: null,
    };
    saveCtx(ctxRef.current);
    setHardwareAssistance(null);
  }, []);

  const activateMic = useCallback(async () => {
    if (blocked) return;
    recognition.clearError();
    setShowSettingsHelp(false);

    // Pause / reprise
    if (conversationActiveRef.current && recognition.isListening) {
      conversationActiveRef.current = false;
      recognition.stopListening();
      setVoiceState("PAUSED");
      return;
    }

    if (conversationActiveRef.current && voiceState === "PAUSED") {
      conversationActiveRef.current = true;
      setVoiceState("REQUESTING_PERMISSION");
      const ok = await recognition.startListening();
      setVoiceState(ok ? "LISTENING" : "ERROR");
      return;
    }

    if (voiceState === "AVA_SPEAKING" || voiceState === "PROCESSING") {
      return;
    }

    // Première activation / reprise depuis IDLE
    conversationActiveRef.current = true;
    setVoiceState("REQUESTING_PERMISSION");
    const ok = await recognition.startListening();
    setVoiceState(ok ? "LISTENING" : "ERROR");
  }, [blocked, recognition, voiceState]);

  /**
   * Démarre ou reprend l'écoute sans basculer en pause
   * (écoute permanente — pas de toggle bouton micro).
   */
  const ensureListening = useCallback(async (): Promise<boolean> => {
    if (blocked) return false;
    recognition.clearError();
    if (voiceState === "AVA_SPEAKING" || voiceState === "PROCESSING") return false;
    if (recognition.isListening && conversationActiveRef.current) return true;

    conversationActiveRef.current = true;
    setVoiceState("REQUESTING_PERMISSION");
    const ok = await recognition.startListening();
    setVoiceState(ok ? "LISTENING" : "ERROR");
    return ok;
  }, [blocked, recognition, voiceState]);

  const toggleMic = activateMic;

  const stopAll = useCallback(() => {
    conversationActiveRef.current = false;
    ignoreResultsRef.current = true;
    abortControllerRef.current?.abort();
    if (echoTimerRef.current) clearTimeout(echoTimerRef.current);
    recognition.abortListening();
    synthesis.stopSpeaking();
    saveCtx(null);
    ctxRef.current = emptyConversationContext();
    setVoiceState("IDLE");
    setShowSettingsHelp(false);
    ignoreResultsRef.current = false;
  }, [recognition, synthesis]);

  /** Suspend l’écoute sans effacer le contexte conversation (mode clavier). */
  const stopListeningOnly = useCallback(() => {
    ignoreResultsRef.current = true;
    recognition.stopListening();
    if (conversationActiveRef.current) {
      setVoiceState("PAUSED");
    }
    ignoreResultsRef.current = false;
  }, [recognition]);

  const confirmPendingYes = useCallback(async () => {
    if (!pendingConfirm) return;
    const t = pendingConfirm;
    setPendingConfirm(null);
    onUserSpokeRef.current?.();
    await sendMessage(t, { speak: true, resumeListening: true });
  }, [pendingConfirm, sendMessage]);

  const confirmPendingCorrect = useCallback(() => {
    const draft = pendingConfirm;
    setPendingConfirm(null);
    return draft;
  }, [pendingConfirm]);

  const setOnUserSpoke = useCallback((fn: (() => void) | null) => {
    onUserSpokeRef.current = fn;
  }, []);

  const needsTextFallback =
    !recognition.canListen || recognition.micPermission === "unsupported";

  return {
    avaState,
    voiceState,
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
    pendingConfirm,
    confirmPendingYes,
    confirmPendingCorrect,
    setOnUserSpoke,
    hardwareAssistance,
    setHardwareAssistance,
    init,
    toggleMic,
    activateMic,
    ensureListening,
    stopAll,
    stopListeningOnly,
    sendMessage,
    clearDiagnosticSession,
    isSpeaking: synthesis.isSpeaking || voiceState === "AVA_SPEAKING",
    activeAudio: synthesis.activeAudio,
    conversationActive: conversationActiveRef.current,
  };
}

export function avaStatusLabel(
  state: AvaConversationState,
  isPrompting = false,
  voiceState?: AvaVoiceState
): string {
  if (isPrompting || voiceState === "REQUESTING_PERMISSION") return MIC_MESSAGES.prompt;
  if (voiceState === "PAUSED") return "Mode texte activé";
  if (voiceState === "RESUMING_LISTENING") return "AVA vous écoute";
  if (voiceState === "USER_SPEAKING") return "AVA vous écoute";
  if (voiceState === "WAITING_FOR_END_OF_SPEECH") return "AVA vous écoute";
  if (voiceState === "ERROR") return "Mode texte activé";
  switch (state) {
    case "listening":
      return "AVA vous écoute";
    case "thinking":
      return "AVA réfléchit";
    case "speaking":
      return "AVA vous répond";
    default:
      return "AVA est disponible";
  }
}
