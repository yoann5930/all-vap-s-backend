"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvaHologramScene } from "@/components/ai/ava3d/AvaHologramScene";
import { AvaChatPanel, AvaDiscussButton, type AvaChatMessage } from "@/components/ai/AvaChatPanel";
import { MicPermissionPanel } from "@/components/ai/MicPermissionPanel";
import { ProductSuggestionCard } from "@/components/ai/ProductSuggestionCard";
import { ConversationStatus } from "@/components/ava/ConversationStatus";
import { LiveSubtitles } from "@/components/ava/LiveSubtitles";
import { AccessibilitySettings } from "@/components/ava/AccessibilitySettings";
import { DiagnosticConversation } from "@/components/ava/DiagnosticConversation";
import { useAvaContinuousListening } from "@/hooks/useAvaContinuousListening";
import { useVoiceConversation, avaStatusLabel } from "@/hooks/useVoiceConversation";
import { confirmationPrompt } from "@/lib/ava/transcription-confidence";
import type { ConfirmedDeviceContext } from "@/lib/ava/device-confirmation";
import {
  AVA_QUICK_ACTIONS,
  cancelReplaceDiagnosticIntent,
  clearPendingIntent,
  confirmReplaceDiagnosticWithIntent,
  consumePendingIntent,
  readIntentNeedsDiagnosticConfirm,
  readPendingIntent,
  type PendingAvaIntent,
} from "@/lib/ava/quick-actions";

function nextChatId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ImmersiveAvaScreenProps {
  onClose: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
  intentSignal?: PendingAvaIntent | null;
  intentNeedsConfirm?: boolean;
  onIntentHandled?: () => void;
}

export function ImmersiveAvaScreen({
  onClose,
  onSpeakingChange,
  intentSignal = null,
  intentNeedsConfirm = false,
  onIntentHandled,
}: ImmersiveAvaScreenProps) {
  const voice = useVoiceConversation();
  const [textSending, setTextSending] = useState(false);
  const [textDraft, setTextDraft] = useState<string | undefined>(undefined);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<AvaChatMessage[]>([]);
  const lastAvaSubtitleRef = useRef<string>("");
  const [showUploader, setShowUploader] = useState(false);
  const [deviceContext, setDeviceContext] = useState<ConfirmedDeviceContext | null>(null);
  const [skipMediaPanel, setSkipMediaPanel] = useState(false);
  const [diagConfirm, setDiagConfirm] = useState<PendingAvaIntent | null>(null);
  const consumedIdsRef = useRef<Set<string>>(new Set());
  const skipGreetingRef = useRef(false);

  // Détecter intention avant init pour éviter le greeting générique
  if (typeof window !== "undefined" && !skipGreetingRef.current) {
    const pending = readPendingIntent() || intentSignal;
    if (pending && !pending.consumed && AVA_QUICK_ACTIONS[pending.intent]?.initialMessage) {
      skipGreetingRef.current = true;
    }
  }

  const continuous = useAvaContinuousListening({
    canListen: voice.canListen,
    micPermission: voice.micPermission,
    isListening:
      voice.voiceState === "LISTENING" ||
      voice.voiceState === "USER_SPEAKING" ||
      voice.voiceState === "WAITING_FOR_END_OF_SPEECH" ||
      voice.voiceState === "RESUMING_LISTENING",
    voicePhase: voice.avaState,
    startListening: async () => voice.ensureListening(),
    stopListening: () => voice.stopListeningOnly(),
    onSilenceHint: () => {
      /* hint voix — non injecté dans le panneau chat pour éviter le bruit */
    },
  });

  const setOnUserSpoke = voice.setOnUserSpoke;
  const onUserSpoke = continuous.onUserSpoke;

  useEffect(() => {
    setOnUserSpoke(() => onUserSpoke());
    return () => setOnUserSpoke(null);
  }, [setOnUserSpoke, onUserSpoke]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    void voice.init({ skipGreeting: skipGreetingRef.current });
    return () => {
      document.body.style.overflow = "";
      voice.stopAll();
    };
    // Montage unique : init + coupe micro à la fermeture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSpeakingChange?.(voice.isSpeaking);
  }, [voice.isSpeaking, onSpeakingChange]);

  const pushUserMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setChatMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "user" && last.text === trimmed) return prev;
      return [...prev, { id: nextChatId(), role: "user", text: trimmed }];
    });
  }, []);

  const applyIntent = useCallback(
    async (pending: PendingAvaIntent, clearDiagnostic: boolean) => {
      if (consumedIdsRef.current.has(pending.id)) return;
      const cfg = AVA_QUICK_ACTIONS[pending.intent];
      if (!cfg?.initialMessage) {
        consumePendingIntent(pending.id);
        clearPendingIntent();
        onIntentHandled?.();
        return;
      }
      const taken = consumePendingIntent(pending.id);
      if (!taken) return;
      consumedIdsRef.current.add(pending.id);
      if (clearDiagnostic) {
        voice.clearDiagnosticSession();
      }
      pushUserMessage(cfg.initialMessage);
      setChatOpen(true);
      setTextSending(true);
      try {
        const resume =
          !continuous.a11y.pauseListening &&
          voice.canListen &&
          voice.micPermission === "granted";
        await voice.sendMessage(cfg.initialMessage, {
          speak: true,
          resumeListening: resume,
        });
      } finally {
        setTextSending(false);
        clearPendingIntent();
        onIntentHandled?.();
      }
    },
    [continuous.a11y.pauseListening, onIntentHandled, pushUserMessage, voice]
  );

  // Confirmation diagnostic ou consommation d’intention
  useEffect(() => {
    if (!voice.ready) return;

    const needs =
      intentNeedsConfirm || Boolean(readIntentNeedsDiagnosticConfirm());
    const pending =
      intentSignal && !intentSignal.consumed
        ? intentSignal
        : readPendingIntent();

    if (needs && pending) {
      setDiagConfirm(pending);
      return;
    }

    if (pending && !pending.consumed && !consumedIdsRef.current.has(pending.id)) {
      void applyIntent(pending, false);
    }
  }, [voice.ready, intentSignal, intentNeedsConfirm, applyIntent]);

  const lastAutoListenAt = useRef(0);

  // Écoute permanente : démarrer / reprendre dès que possible (IDLE ou PAUSED)
  useEffect(() => {
    if (!voice.ready || voice.blocked) return;
    if (continuous.a11y.pauseListening) return;
    if (voice.micPermission === "denied" || voice.micPermission === "unsupported") {
      continuous.setTextPanelForced(true);
      return;
    }
    if (
      (voice.micPermission === "granted" || voice.micPermission === "unknown") &&
      (voice.voiceState === "IDLE" || voice.voiceState === "PAUSED")
    ) {
      const now = Date.now();
      // Anti-boucle si startListening échoue → PAUSED
      if (now - lastAutoListenAt.current < 2200) return;
      lastAutoListenAt.current = now;
      void voice.ensureListening();
    }
  }, [voice.ready, voice.micPermission, voice.voiceState, voice.blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Réponses A.V.A. → historique UI (texte complet, pas le sous-titre tronqué)
  useEffect(() => {
    const full = (voice.lastReplyText || voice.subtitle || "").trim();
    if (!full || full === lastAvaSubtitleRef.current) return;
    lastAvaSubtitleRef.current = full;
    setChatMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "ava" && last.text === full) return prev;
      return [...prev, { id: nextChatId(), role: "ava", text: full }];
    });
  }, [voice.lastReplyText, voice.subtitle]);

  useEffect(() => {
    if (
      voice.error &&
      /pas (bien )?entendu|n['']ai pas compris|écoute s'est interrompue/i.test(voice.error)
    ) {
      continuous.onEmptyRecognition();
      if (!continuous.a11y.pauseListening && voice.micPermission === "granted") {
        void voice.ensureListening();
      }
    }
  }, [voice.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chat overlay (silence / correction / a11y) — n'interrompt jamais l'écoute
  useEffect(() => {
    if (
      continuous.textPanelForced ||
      continuous.a11y.pauseListening ||
      Boolean(textDraft)
    ) {
      setChatOpen(true);
    }
  }, [continuous.textPanelForced, continuous.a11y.pauseListening, textDraft]);

  const handlePermissionGranted = useCallback(() => {
    continuous.setTextPanelForced(false);
    void voice.ensureListening();
  }, [continuous, voice]);

  const handleSendText = useCallback(
    async (text: string) => {
      continuous.onUserTyped();
      pushUserMessage(text);
      setTextDraft(undefined);
      setTextSending(true);
      try {
        const voiceOk =
          !continuous.a11y.pauseListening &&
          voice.canListen &&
          voice.micPermission === "granted";
        // Écriture = canal parallèle : on parle + on reprend l'écoute (sauf a11y / micro refusé)
        await voice.sendMessage(text, {
          speak: voiceOk || voice.micPermission === "unknown",
          resumeListening: voiceOk || voice.micPermission === "unknown",
        });
      } finally {
        setTextSending(false);
        if (
          !continuous.a11y.pauseListening &&
          (voice.micPermission === "granted" || voice.micPermission === "unknown")
        ) {
          void voice.ensureListening();
        }
      }
    },
    [continuous, pushUserMessage, voice]
  );

  const confirmYes = useCallback(async () => {
    continuous.onUserSpoke();
    if (voice.pendingConfirm) {
      pushUserMessage(voice.pendingConfirm);
    }
    await voice.confirmPendingYes();
  }, [continuous, pushUserMessage, voice]);

  const confirmCorrect = useCallback(() => {
    const draft = voice.confirmPendingCorrect();
    continuous.setTextPanelForced(true);
    setChatOpen(true);
    if (draft) setTextDraft(draft);
  }, [continuous, voice]);

  const handleContinueWithText = useCallback(() => {
    // Ouvre le chat sans abandonner l'écoute (sauf micro vraiment indisponible)
    setChatOpen(true);
    continuous.setTextPanelForced(true);
    if (
      !continuous.a11y.pauseListening &&
      voice.micPermission !== "denied" &&
      voice.micPermission !== "unsupported"
    ) {
      void voice.ensureListening();
    }
  }, [continuous, voice]);

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
    continuous.setTextPanelForced(false);
    setTextDraft(undefined);
    // Historique + session conservés — reprise écoute si besoin
    if (
      !continuous.a11y.pauseListening &&
      (voice.micPermission === "granted" || voice.micPermission === "unknown")
    ) {
      void voice.ensureListening();
    }
  }, [continuous, voice]);

  /** Toujours réactiver l'écoute — pas de coupe micro via le chat (sauf a11y). */
  const handleToggleMic = useCallback(() => {
    if (continuous.a11y.pauseListening) {
      continuous.updateA11y({ pauseListening: false });
      return;
    }
    continuous.setTextPanelForced(false);
    void voice.ensureListening();
  }, [continuous, voice]);

  const micActive =
    !continuous.a11y.pauseListening &&
    (voice.voiceState === "LISTENING" ||
      voice.voiceState === "USER_SPEAKING" ||
      voice.voiceState === "WAITING_FOR_END_OF_SPEECH" ||
      voice.voiceState === "RESUMING_LISTENING");

  const showSubtitles =
    continuous.a11y.subtitlesAlways !== false &&
    (Boolean(voice.subtitle) || Boolean(voice.interimTranscript));

  const statusLabel = avaStatusLabel(
    voice.avaState,
    voice.isPromptingMic,
    voice.voiceState
  );

  // Permission micro : uniquement si vraiment nécessaire (pas pendant reprise silencieuse)
  const showMicModal =
    !continuous.a11y.pauseListening &&
    (voice.isPromptingMic ||
      voice.micPermission === "prompting" ||
      voice.micPermission === "unsupported" ||
      (voice.micPermission === "unknown" &&
        voice.voiceState === "REQUESTING_PERMISSION") ||
      voice.micPermission === "denied");

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="AVA — assistante holographique"
        aria-modal="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7 }}
        className="ava-immersive ava-fullscreen-root fixed inset-0 z-[70] bg-black"
        data-ava-continuous="v1"
        data-ava-layout="salesfloor-closeup"
      >
        {/* Stage plein viewport — Ava = sujet unique (vendeuse en face) */}
        <div
          className="ava-fullscreen-stage absolute inset-0 z-0 h-[100dvh] w-screen overflow-hidden"
          aria-hidden={false}
        >
          <div className="ava-immersive-face ava-fullscreen-avatar absolute inset-0 h-full w-full">
            <AvaHologramScene
              state={
                voice.isSpeaking && voice.avaState !== "speaking"
                  ? "speaking"
                  : voice.avaState
              }
              isSpeaking={voice.isSpeaking}
              audioElement={voice.activeAudio}
              speechText={voice.lastReplyText || voice.subtitle || ""}
              className="absolute inset-0 h-full w-full"
            />
          </div>
          {!voice.ready && (
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-black/35">
              <Loader2 className="h-7 w-7 animate-spin text-cyan-700/35" aria-label="Chargement" />
            </div>
          )}
        </div>

        <div className="absolute left-3 top-3 z-[80] opacity-50 transition hover:opacity-100 sm:left-5 sm:top-5">
          <AccessibilitySettings
            prefs={continuous.a11y}
            onChange={continuous.updateA11y}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            voice.stopAll();
            onClose();
          }}
          className="absolute right-4 top-4 z-[80] flex items-center gap-1.5 rounded-lg border border-cyan-800/25 px-3 py-1.5 text-[10px] tracking-wider text-cyan-600/40 transition hover:border-cyan-600/35 hover:text-cyan-400/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50 sm:right-6 sm:top-6"
          aria-label="Fermer AVA et couper le microphone"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.25} />
          <span className="hidden sm:inline">FERMER</span>
        </button>

        {diagConfirm ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmer le changement de parcours"
            className="absolute inset-x-4 top-20 z-[85] mx-auto max-w-md rounded-xl border border-cyan-500/35 bg-black/90 p-4 text-center shadow-lg sm:inset-x-auto"
          >
            <p className="text-sm text-cyan-50/90">
              Un diagnostic est actuellement en cours. Souhaitez-vous le quitter pour démarrer
              ce nouveau parcours ?
            </p>
            <p className="mt-1 text-[11px] text-cyan-400/60">
              {AVA_QUICK_ACTIONS[diagConfirm.intent]?.label}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-cyan-700/40 px-4 py-2 text-xs text-cyan-200"
                onClick={() => {
                  cancelReplaceDiagnosticIntent();
                  setDiagConfirm(null);
                  onIntentHandled?.();
                }}
              >
                Continuer le diagnostic
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-xs text-cyan-50"
                onClick={() => {
                  const fresh = confirmReplaceDiagnosticWithIntent();
                  setDiagConfirm(null);
                  if (fresh) void applyIntent(fresh, true);
                  else onIntentHandled?.();
                }}
              >
                Démarrer le nouveau parcours
              </button>
            </div>
          </div>
        ) : null}

        {/* UI overlay — ne redimensionne jamais le stage avatar */}
        <div
          className={`ava-fullscreen-ui absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end pt-2 ${
            chatOpen ? "pb-2 sm:pb-4" : "pb-6 sm:pb-8"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black via-black/80 to-transparent" />

          <div className="relative flex flex-col items-center gap-3">
            {showSubtitles ? (
              <LiveSubtitles
                assistantText={voice.subtitle}
                userText={voice.interimTranscript || undefined}
                largeText={continuous.a11y.largeText}
                highContrast={continuous.a11y.highContrast}
              />
            ) : null}

            {voice.products.length > 0 ? (
              <div className="max-h-[18vh] w-full max-w-md space-y-2 overflow-y-auto px-3 scrollbar-hide">
                {voice.products.map((p, idx) => (
                  <ProductSuggestionCard
                    key={p.id}
                    index={idx}
                    product={{
                      id: p.id,
                      name: p.name,
                      slug: p.slug,
                      imageUrl: p.imageUrl ?? null,
                      priceCents: p.priceCents,
                      promoPriceCents: p.promoPriceCents,
                      isPromo: p.isPromo,
                      stock: p.stock,
                      description: p.description ?? null,
                      reason: p.reason ?? "catalogue",
                      nicotine: p.nicotine,
                      pgVg: p.pgVg,
                      volume: p.volume,
                      variantId: p.variantId ?? null,
                    }}
                  />
                ))}
              </div>
            ) : null}

            {!chatOpen ? (
              <ConversationStatus
                mode={continuous.mode}
                phase={voice.avaState}
                micActive={micActive}
              />
            ) : null}

            {voice.hardwareAssistance?.showMediaUploader ||
            voice.hardwareAssistance?.showDeviceConfirmation ||
            (voice.hardwareAssistance as { diagnosticSession?: { active?: boolean } } | null)
              ?.diagnosticSession?.active ? (
              <DiagnosticConversation
                showMedia={
                  (Boolean(voice.hardwareAssistance?.showMediaUploader) ||
                    Boolean(
                      (voice.hardwareAssistance as { diagnosticSession?: { active?: boolean } })
                        ?.diagnosticSession?.active
                    )) &&
                  !skipMediaPanel &&
                  !showUploader
                }
                showUploader={showUploader}
                showConfirmation={Boolean(
                  voice.hardwareAssistance?.showDeviceConfirmation
                )}
                candidates={voice.hardwareAssistance?.candidates ?? []}
                photoButtons={
                  (voice.hardwareAssistance as { photoButtons?: Array<{ id: string; label: string }> })
                    ?.photoButtons
                }
                onOpenUploader={() => {
                  setShowUploader(true);
                  setSkipMediaPanel(true);
                }}
                onSkipMedia={() => setSkipMediaPanel(true)}
                onPhotoAction={(id) => {
                  void handleSendText(`J'ajoute une photo : ${id}.`);
                }}
                onMediaUploaded={() => {
                  void handleSendText(
                    "J'ai envoyé une photo de mon matériel pour identification."
                  );
                }}
                onConfirmDevice={(c) => {
                  void (async () => {
                    const res = await fetch("/api/ava/device-identify", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        confirmSlug: c.modelSlug.includes("-")
                          ? c.modelSlug
                          : `${c.manufacturer}-${c.model}`.toLowerCase().replace(/\s+/g, "-"),
                        method: "CLIENT_SELECTED_IMAGE",
                      }),
                    });
                    const data = await res.json();
                    if (data.allowed && data.context) {
                      setDeviceContext(data.context as ConfirmedDeviceContext);
                      voice.setHardwareAssistance(null);
                      await handleSendText(
                        /drag\s*6/i.test(c.model)
                          ? `Oui, c'est la Drag 6. Check Atomizer.`
                          : `Oui, c'est bien mon ${c.manufacturer} ${c.model}.`
                      );
                    }
                  })();
                }}
                onRejectDevice={() => {
                  setDeviceContext(null);
                  void handleSendText("Non, ce n'est pas celui-ci.");
                }}
                onUnsure={() => {
                  setShowUploader(true);
                  void handleSendText("Je ne suis pas sûr du modèle.");
                }}
              />
            ) : null}

            {deviceContext ? (
              <p className="text-[10px] text-cyan-600/50" aria-live="polite">
                Matériel confirmé (session) : {deviceContext.manufacturer}{" "}
                {deviceContext.model}
                {deviceContext.cartridge ? ` — ${deviceContext.cartridge}` : ""}
              </p>
            ) : null}

            {voice.pendingConfirm ? (
              <div
                role="alertdialog"
                aria-label="Confirmer la transcription"
                className="mx-4 max-w-md rounded-xl border border-cyan-500/30 bg-black/80 p-3 text-center"
              >
                <p className="text-sm text-cyan-50/90">
                  {confirmationPrompt(voice.pendingConfirm)}
                </p>
                <div className="mt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    className="min-h-10 rounded-lg border border-cyan-400/40 px-4 py-2 text-xs text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
                    onClick={() => void confirmYes()}
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    className="min-h-10 rounded-lg border border-cyan-700/40 px-4 py-2 text-xs text-cyan-300/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
                    onClick={confirmCorrect}
                  >
                    Corriger
                  </button>
                </div>
              </div>
            ) : null}

            {/* Un seul CTA — pas de champ texte permanent */}
            <div className="flex flex-col items-center gap-2 px-4 pb-2">
              <AvaDiscussButton
                open={chatOpen}
                disabled={!voice.ready || voice.blocked}
                onClick={() => setChatOpen(true)}
              />
            </div>
          </div>
        </div>

        <AvaChatPanel
          open={chatOpen}
          messages={chatMessages}
          disabled={!voice.ready || voice.blocked}
          sending={textSending}
          thinking={voice.avaState === "thinking"}
          micAvailable={voice.canListen && voice.micPermission === "granted"}
          micActive={micActive}
          draft={textDraft}
          statusLabel={statusLabel}
          onClose={handleCloseChat}
          onMinimize={handleCloseChat}
          onSend={handleSendText}
          onToggleMic={handleToggleMic}
        />

        {showMicModal && (
          <MicPermissionPanel
            status={voice.micPermission}
            isPrompting={voice.isPromptingMic}
            showSettingsHelp={voice.showSettingsHelp}
            onActivateMic={() => void voice.ensureListening()}
            onToggleSettingsHelp={() => voice.setShowSettingsHelp((v) => !v)}
            onPermissionGranted={handlePermissionGranted}
            onContinueWithText={handleContinueWithText}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export const AIAssistantChat = ImmersiveAvaScreen;
