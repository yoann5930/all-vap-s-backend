"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

type LinkItem = { label: string; href: string; kind?: string };
type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  links?: LinkItem[];
  status?: string;
  errorCode?: string | null;
};

type Conversation = {
  id: string;
  title: string | null;
  updatedAt: string;
  status: string;
};

type AvaStatus = {
  vm?: string;
  app?: string;
  ava?: string;
  role?: string;
  lastError?: string | null;
  orchestratorReachable?: boolean;
};

type AgentInfo = {
  suspended?: boolean;
  lastAction?: string | null;
  nextAction?: string | null;
  lastError?: string | null;
};

type OwnerIdentity = {
  id: string;
  primaryEmail: string;
  verifiedAt: string | null;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

type MicDiagCode =
  | "ok"
  | "speech_unsupported"
  | "permission_denied"
  | "permission_policy"
  | "no_microphone"
  | "microphone_busy"
  | "getusermedia_failed"
  | "speech_start_failed"
  | "speech_service"
  | "speech_network"
  | "no_speech"
  | "aborted";

function mapSpeechError(code: string): { diag: MicDiagCode; message: string } {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        diag: "permission_denied",
        message:
          "Le navigateur bloque l'accès micro pour la reconnaissance vocale (permission ou Permissions-Policy). Vérifie le cadenas du site, puis réessaie.",
      };
    case "audio-capture":
      return {
        diag: "no_microphone",
        message: "Aucun microphone utilisable n'a été trouvé sur cet appareil.",
      };
    case "network":
      return {
        diag: "speech_network",
        message: "Service de reconnaissance vocale indisponible (réseau). Réessaie ou continue en texte.",
      };
    case "no-speech":
      return {
        diag: "no_speech",
        message: "Aucun son détecté. Réessaie en parlant un peu plus près du micro.",
      };
    case "aborted":
      return { diag: "aborted", message: "" };
    default:
      return {
        diag: "speech_start_failed",
        message: `Reconnaissance vocale interrompue (${code}). Tu peux continuer en texte.`,
      };
  }
}

function mapGetUserMediaError(err: unknown): { diag: MicDiagCode; message: string } {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    // Distingue refus utilisateur vs policy si le message le dit
    const msg = err instanceof Error ? err.message : "";
    if (/Permissions policy|Permission Policy|permissions policy/i.test(msg)) {
      return {
        diag: "permission_policy",
        message:
          "Le micro est bloqué par la politique de sécurité de la page (Permissions-Policy). Ce n'est pas le réglage Edge du site.",
      };
    }
    return {
      diag: "permission_denied",
      message:
        "Permission micro refusée par le navigateur. Autorise le micro pour www.allvaps.fr puis recharge.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      diag: "no_microphone",
      message: "Aucun microphone détecté sur cet appareil.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      diag: "microphone_busy",
      message: "Le microphone est occupé par une autre application. Ferme-la puis réessaie.",
    };
  }
  if (name === "AbortError") {
    return { diag: "aborted", message: "Ouverture du micro annulée." };
  }
  if (name === "SecurityError") {
    return {
      diag: "permission_policy",
      message: "Accès micro interdit dans ce contexte (sécurité navigateur / iframe).",
    };
  }
  return {
    diag: "getusermedia_failed",
    message: "Impossible d'ouvrir le microphone. Tu peux continuer en texte.",
  };
}

const SECRET_SPEAK =
  /\b(mot\s*de\s*passe|password|token|api[_-]?key|secret|Bearer\s+\S+|sk-[a-zA-Z0-9_-]+)\b/i;

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

/** Synthèse vocale — Promise résolue à la fin réelle (évite de réécouter trop tôt). */
function speakSafe(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const clean = text
      .replace(SECRET_SPEAK, "[masqué]")
      .replace(/sk-[a-zA-Z0-9_-]+/g, "[masqué]")
      .slice(0, 1200);
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "fr-FR";
    let done = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (poll) clearInterval(poll);
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
    // Certains navigateurs omettent onend — poll jusqu'à la fin réelle
    let sawSpeaking = false;
    poll = setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        sawSpeaking = true;
        return;
      }
      if (sawSpeaking) finish();
    }, 200);
    // Garde-fou absolu (évite hang infini)
    setTimeout(finish, 12_000);
  });
}

export function AdminAvaChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<AvaStatus | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [effectiveRole, setEffectiveRole] = useState<string>("");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [transcriptLive, setTranscriptLive] = useState("");
  const [micDenied, setMicDenied] = useState(false);
  const [micDiag, setMicDiag] = useState<MicDiagCode | null>(null);
  const [identities, setIdentities] = useState<OwnerIdentity[]>([]);
  const [canManageOwners, setCanManageOwners] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [showIdentities, setShowIdentities] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryFacts, setMemoryFacts] = useState<
    {
      id: string;
      kind: string;
      subject: string;
      content: string;
      importance: string;
      taskStatus?: string;
      updatedAt: string;
    }[]
  >([]);
  const [memorySession, setMemorySession] = useState<{
    summary?: string;
    lastTopic?: string | null;
    updatedAt?: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const handsFreeRef = useRef(false);
  const ttsEnabledRef = useRef(false);
  const loadingRef = useRef(false);
  const speakingRef = useRef(false);
  /** true = l'utilisateur a demandé l'arrêt → jamais de restart auto */
  const manualStopRef = useRef(true);
  /** true = stop/abort volontaire (TTS, envoi) → ignorer erreur aborted */
  const intentionalAbortRef = useRef(false);
  /** true = on attend fin send/TTS → onend ne doit PAS relancer */
  const pauseRestartRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const startListeningRef = useRef<(fromHandsFree?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      try {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
    };
  }, []);

  const loadIdentities = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ava/identities", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setIdentities(data.identities || []);
      setCanManageOwners(!!data.canManage);
    } catch {
      /* optional */
    }
  }, []);

  const loadMemory = useCallback(async (cid?: string | null) => {
    try {
      const q = cid ? `?conversationId=${encodeURIComponent(cid)}` : "";
      const res = await fetch(`/api/admin/ava/memory${q}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMemoryFacts(data.facts || []);
      setMemorySession(data.session || null);
    } catch {
      /* optional */
    }
  }, []);

  const load = useCallback(async (cid?: string | null) => {
    const q = cid ? `?conversationId=${encodeURIComponent(cid)}` : "";
    const res = await fetch(`/api/admin/ava/chat${q}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error ||
          (res.status === 401 || res.status === 403 ? "Accès Admin requis" : "Chargement impossible")
      );
      setLastErrorCode(data.errorCode || null);
      return;
    }
    const data = await res.json();
    setConversationId(data.conversationId || null);
    setConversations(data.conversations || []);
    setMessages(
      (data.messages || []).map(
        (m: {
          id?: string;
          role: string;
          content: string;
          linksJson?: LinkItem[];
          links?: LinkItem[];
          status?: string;
          errorCode?: string | null;
        }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          links: m.links || m.linksJson || [],
          status: m.status,
          errorCode: m.errorCode,
        })
      )
    );
    setStatus(data.status || null);
    setAgent(data.agent || null);
    setOnline(!!data.online);
    setSuggestions(data.suggestions || []);
    setEffectiveRole(data.effectiveRole || "");
    setError(null);
    setLastErrorCode(null);
  }, []);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("ava.admin.conversationId")
        : null;
    void load(saved);
    void loadIdentities();
    void loadMemory(saved);
    const t = setInterval(() => void load(conversationIdRef.current), 30_000);
    return () => clearInterval(t);
  }, [load, loadIdentities, loadMemory]);

  useEffect(() => {
    if (conversationId && typeof window !== "undefined") {
      window.localStorage.setItem("ava.admin.conversationId", conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function newConversation() {
    const res = await fetch("/api/admin/ava/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setError("Impossible de créer une conversation");
      return;
    }
    const data = await res.json();
    setConversationId(data.conversation.id);
    setMessages([]);
    await load(data.conversation.id);
  }

  async function selectConversation(id: string) {
    setConversationId(id);
    await load(id);
  }

  async function send(text: string, opts?: { confirmSensitive?: boolean }) {
    const msg = text.trim();
    if (!msg || loadingRef.current) return;
    setLoading(true);
    loadingRef.current = true;
    if (handsFreeRef.current) setVoicePhase("thinking");
    setError(null);
    setLastErrorCode(null);
    setLastFailedMessage(null);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setTranscriptLive("");
    try {
      const res = await fetch("/api/admin/ava/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          conversationId: conversationIdRef.current,
          confirmSensitive: opts?.confirmSensitive,
        }),
      });
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);

      if (data.needsConfirmation) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.text, status: "needs_confirm" },
        ]);
        setLastFailedMessage(msg);
        if (handsFreeRef.current && !manualStopRef.current) {
          scheduleHandsFreeRestart(500);
        } else {
          pauseRestartRef.current = false;
          setVoicePhase("idle");
        }
        return;
      }

      if (!res.ok && !data.text) {
        throw Object.assign(new Error(data.error || "Erreur"), {
          code: data.errorCode,
        });
      }

      const assistantText = data.text || data.error || "Réponse vide";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: assistantText,
          links: data.links || [],
          status: data.errorCode ? "error" : "ok",
          errorCode: data.errorCode || null,
        },
      ]);
      if (data.errorCode) {
        setLastErrorCode(data.errorCode);
        setLastFailedMessage(msg);
        setError(data.error || assistantText);
      }
      if (data.status) setStatus(data.status);
      if (data.agent) setAgent(data.agent);

      // TTS : pause micro (déjà arrêté) → parler → attendre fin réelle
      if (ttsEnabledRef.current && !data.errorCode) {
        pauseRestartRef.current = true;
        speakingRef.current = true;
        setVoicePhase("speaking");
        await speakSafe(assistantText);
        speakingRef.current = false;
      }

      await load(data.conversationId || conversationIdRef.current);
      void loadMemory(data.conversationId || conversationIdRef.current);

      // Relance mains libres après traitement (+ TTS si activé)
      if (
        handsFreeRef.current &&
        !manualStopRef.current &&
        !data.errorCode &&
        !data.needsConfirmation
      ) {
        scheduleHandsFreeRestart(350);
      } else if (data.errorCode && handsFreeRef.current && !manualStopRef.current) {
        scheduleHandsFreeRestart(600);
      } else {
        pauseRestartRef.current = false;
        if (!handsFreeRef.current) setVoicePhase("idle");
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message || "Erreur");
      setLastErrorCode(err.code || "AVA_INTERNAL_ERROR");
      setLastFailedMessage(msg);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "A.V.A. rencontre un souci technique. Tu peux réessayer — la conversation continue.",
          status: "error",
          errorCode: err.code || "AVA_INTERNAL_ERROR",
        },
      ]);
      speakingRef.current = false;
      if (handsFreeRef.current && !manualStopRef.current) {
        scheduleHandsFreeRestart(600);
      } else {
        setVoicePhase("idle");
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  function clearRestartTimer() {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  /** Restart contrôlé — jamais pendant TTS / traitement / arrêt manuel */
  function scheduleHandsFreeRestart(delayMs = 400) {
    clearRestartTimer();
    pauseRestartRef.current = false;
    if (!handsFreeRef.current || manualStopRef.current) {
      setVoicePhase("idle");
      return;
    }
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (
        !handsFreeRef.current ||
        manualStopRef.current ||
        loadingRef.current ||
        speakingRef.current ||
        pauseRestartRef.current
      ) {
        return;
      }
      void startListeningRef.current(true);
    }, delayMs);
  }

  function stopMicStream() {
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    mediaStreamRef.current = null;
  }

  /** Arrêt recognition ; keepStream=true pour relancer sans redemander le micro */
  function stopRecognition(opts?: { keepStream?: boolean; intentional?: boolean }) {
    if (opts?.intentional) intentionalAbortRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setListening(false);
    if (!opts?.keepStream) stopMicStream();
  }

  /** Arrêt manuel utilisateur — bloque tout restart auto */
  function stopListeningManual() {
    manualStopRef.current = true;
    clearRestartTimer();
    intentionalAbortRef.current = true;
    speakingRef.current = false;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    stopRecognition({ keepStream: false, intentional: true });
    setHandsFree(false);
    handsFreeRef.current = false;
    setVoicePhase("idle");
  }

  async function ensureMicStream(): Promise<boolean> {
    const live = mediaStreamRef.current?.getTracks().some((t) => t.readyState === "live");
    if (live) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicDiag("getusermedia_failed");
      setError("getUserMedia indisponible. Continue en texte.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      return true;
    } catch (err) {
      const mapped = mapGetUserMediaError(err);
      setMicDiag(mapped.diag);
      setMicDenied(mapped.diag === "permission_denied" || mapped.diag === "permission_policy");
      setError(mapped.message);
      setHandsFree(false);
      handsFreeRef.current = false;
      manualStopRef.current = true;
      console.info("[ava-admin-voice]", mapped.diag);
      return false;
    }
  }

  async function startListening(fromHandsFree = false) {
    // Si restart auto mais mains libres coupé entre-temps
    if (fromHandsFree && (manualStopRef.current || !handsFreeRef.current)) {
      setVoicePhase("idle");
      return;
    }
    if (loadingRef.current || speakingRef.current) {
      if (fromHandsFree) scheduleHandsFreeRestart(500);
      return;
    }

    setError(null);
    setMicDiag(null);
    setMicDenied(false);

    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setMicDiag("speech_unsupported");
      setError(
        "Reconnaissance vocale indisponible sur ce navigateur. Continue en texte — le chat Admin reste actif."
      );
      if (fromHandsFree) {
        setHandsFree(false);
        handsFreeRef.current = false;
        manualStopRef.current = true;
      }
      return;
    }

    // Stop recognition en cours sans tuer le stream (mains libres)
    stopRecognition({ keepStream: fromHandsFree || handsFreeRef.current, intentional: true });

    const ok = await ensureMicStream();
    if (!ok) {
      setVoicePhase("idle");
      return;
    }

    // Re-check après await getUserMedia
    if (fromHandsFree && (manualStopRef.current || !handsFreeRef.current)) {
      setVoicePhase("idle");
      return;
    }
    if (loadingRef.current || speakingRef.current) {
      if (fromHandsFree) scheduleHandsFreeRestart(500);
      return;
    }

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "fr-FR";
    rec.interimResults = true;
    // continuous=true seul ne suffit pas — on gère le restart via onend
    rec.continuous = false;

    rec.onresult = (ev) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscriptLive(final || interim);
      if (final.trim()) {
        const text = final.trim();
        setInput(text);
        if (fromHandsFree || handsFreeRef.current) {
          // Pause micro pendant traitement / TTS — évite l'auto-écoute
          // et empêche onend de relancer avant la fin de send()
          pauseRestartRef.current = true;
          intentionalAbortRef.current = true;
          setVoicePhase("thinking");
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          void send(text);
        }
      }
    };

    rec.onerror = (ev) => {
      const code = ev.error;
      const mapped = mapSpeechError(code);

      if (code === "aborted" || mapped.diag === "aborted") {
        setListening(false);
        // Abort volontaire (TTS / envoi) → silencieux
        if (intentionalAbortRef.current) {
          intentionalAbortRef.current = false;
          return;
        }
        return;
      }

      if (code === "no-speech") {
        setListening(false);
        setMicDiag("no_speech");
        // Silence : en mains libres, relancer ; sinon message doux
        if (handsFreeRef.current && !manualStopRef.current) {
          scheduleHandsFreeRestart(450);
        } else {
          setError(mapped.message);
        }
        return;
      }

      setMicDiag(mapped.diag);
      setListening(false);
      console.info("[ava-admin-voice]", mapped.diag, code);

      if (mapped.diag === "permission_denied") {
        setMicDenied(true);
        setError(mapped.message);
        manualStopRef.current = true;
        setHandsFree(false);
        handsFreeRef.current = false;
        stopMicStream();
        setVoicePhase("idle");
        return;
      }

      if (mapped.diag === "no_microphone" || mapped.diag === "microphone_busy") {
        setError(mapped.message);
        manualStopRef.current = true;
        setHandsFree(false);
        handsFreeRef.current = false;
        stopMicStream();
        setVoicePhase("idle");
        return;
      }

      if (mapped.diag === "speech_network") {
        setError(mapped.message);
        if (handsFreeRef.current && !manualStopRef.current) {
          scheduleHandsFreeRestart(1500);
        }
        return;
      }

      if (mapped.message) setError(mapped.message);
      if (handsFreeRef.current && !manualStopRef.current) {
        scheduleHandsFreeRestart(800);
      }
    };

    rec.onend = () => {
      setListening(false);
      // Pendant send/TTS : send() relancera via scheduleHandsFreeRestart
      if (pauseRestartRef.current || loadingRef.current || speakingRef.current) {
        return;
      }
      // Boucle mains libres : restart si on n'est pas en train de traiter/parler
      if (handsFreeRef.current && !manualStopRef.current) {
        scheduleHandsFreeRestart(400);
        return;
      }
      if (!handsFreeRef.current) {
        stopMicStream();
        setVoicePhase("idle");
      }
    };

    try {
      intentionalAbortRef.current = false;
      rec.start();
      setListening(true);
      setVoicePhase("listening");
      setMicDiag("ok");
    } catch (err) {
      stopMicStream();
      setMicDiag("speech_start_failed");
      setError("Impossible de démarrer la reconnaissance vocale. Continue en texte.");
      console.info("[ava-admin-voice]", "speech_start_failed", err);
      if (handsFreeRef.current && !manualStopRef.current) {
        scheduleHandsFreeRestart(1000);
      } else {
        setVoicePhase("idle");
      }
    }
  }

  startListeningRef.current = startListening;

  async function addOwner() {
    const email = newOwnerEmail.trim();
    if (!email) return;
    const res = await fetch("/api/admin/ava/identities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryEmail: email, verify: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ajout OWNER impossible");
      return;
    }
    setNewOwnerEmail("");
    await loadIdentities();
  }

  async function removeOwner(email: string) {
    const res = await fetch("/api/admin/ava/identities", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryEmail: email }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Suppression impossible");
      return;
    }
    await loadIdentities();
  }

  const statusLabel = agent?.suspended
    ? "Suspendue"
    : online
      ? "Online"
      : status?.orchestratorReachable
        ? "Occupée / VM arrêtée"
        : "Offline";

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-3">
        <Button type="button" onClick={() => void newConversation()} className="w-full">
          Nouvelle conversation
        </Button>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2">
          {conversations.length === 0 && (
            <p className="p-2 text-xs text-gray-500">Aucune conversation</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void selectConversation(c.id)}
              className={`block w-full rounded-lg px-2 py-2 text-left text-xs ${
                c.id === conversationId
                  ? "bg-brand-50 text-brand-900"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <div className="line-clamp-2 font-medium">{c.title || "Sans titre"}</div>
              <div className="text-[10px] text-gray-400">
                {new Date(c.updatedAt).toLocaleString("fr-FR")}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="text-xs text-brand-700 hover:underline"
          onClick={() => setShowIdentities((v) => !v)}
        >
          Identités propriétaire
        </button>
        <button
          type="button"
          className="block text-xs text-brand-700 hover:underline"
          onClick={() => {
            setShowMemory((v) => !v);
            if (!showMemory) void loadMemory(conversationIdRef.current);
          }}
        >
          Mémoire A.V.A.
        </button>
        <Link href="/admin/ava/reflections" className="block text-xs text-brand-700 hover:underline">
          Réflexions A.V.A.
        </Link>
        <Link href="/admin/ava/radar" className="block text-xs text-brand-700 hover:underline">
          Radar marché
        </Link>
      </aside>

      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">A.V.A.</h1>
          <p className="mt-1 text-sm text-gray-600">
            Collègue métier All Vap&apos;s — initiative, avis, mémoire de fil.
            {effectiveRole ? ` · Rôle effectif : ${effectiveRole}` : ""}
          </p>
        </header>

        <Card>
          <CardBody className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                statusLabel === "Online"
                  ? "bg-emerald-50 text-emerald-800"
                  : statusLabel === "Suspendue"
                    ? "bg-red-50 text-red-800"
                    : "bg-amber-50 text-amber-900"
              }`}
            >
              Statut : {statusLabel}
            </span>
            <span className="text-gray-600">VM : {status?.vm || "—"}</span>
            <span className="text-gray-600">App : {status?.app || "—"}</span>
            <Link href="/admin/fidelatoo/control-center" className="text-brand-700 hover:underline">
              Centre de contrôle
            </Link>
          </CardBody>
        </Card>

        {showMemory && (
          <Card>
            <CardBody className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900">Mémoire A.V.A.</h2>
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:underline"
                  onClick={() =>
                    void (async () => {
                      await fetch("/api/admin/ava/memory", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "clear_session",
                          conversationId,
                        }),
                      });
                      await loadMemory(conversationId);
                    })()
                  }
                >
                  Vider mémoire conversationnelle
                </button>
              </div>
              {memorySession?.summary ? (
                <p className="rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                  <span className="font-medium">Session :</span> {memorySession.summary}
                  {memorySession.lastTopic ? ` · sujet ${memorySession.lastTopic}` : ""}
                </p>
              ) : (
                <p className="text-xs text-gray-500">Pas encore de résumé de session.</p>
              )}
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {memoryFacts.length === 0 && (
                  <li className="text-xs text-gray-500">Aucun fait mémorisé pour l’instant.</li>
                )}
                {memoryFacts.slice(0, 30).map((f) => (
                  <li key={f.id} className="rounded-lg border border-gray-100 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{f.subject}</span>
                      <span className="text-gray-400">[{f.kind}]</span>
                      {f.taskStatus ? (
                        <span className="text-amber-700">{f.taskStatus}</span>
                      ) : null}
                      <span className="text-gray-400">{f.importance}</span>
                    </div>
                    <p className="mt-1 text-gray-700">{f.content}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-brand-700 hover:underline"
                        onClick={() =>
                          void (async () => {
                            const content = window.prompt("Corriger ce souvenir :", f.content);
                            if (!content) return;
                            await fetch("/api/admin/ava/memory", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "correct",
                                itemId: f.id,
                                content,
                              }),
                            });
                            await loadMemory(conversationId);
                          })()
                        }
                      >
                        Corriger
                      </button>
                      <button
                        type="button"
                        className="text-brand-700 hover:underline"
                        onClick={() =>
                          void (async () => {
                            await fetch("/api/admin/ava/memory", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "importance",
                                itemId: f.id,
                                importance: "high",
                              }),
                            });
                            await loadMemory(conversationId);
                          })()
                        }
                      >
                        Important
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() =>
                          void (async () => {
                            await fetch("/api/admin/ava/memory", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "delete", itemId: f.id }),
                            });
                            await loadMemory(conversationId);
                          })()
                        }
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {showIdentities && (
          <Card>
            <CardBody className="space-y-3 text-sm">
              <h2 className="font-semibold text-gray-900">Identités propriétaire</h2>
              <ul className="space-y-1">
                {identities.map((id) => (
                  <li key={id.id} className="flex flex-wrap items-center gap-2">
                    <span>{id.primaryEmail}</span>
                    <span className="text-xs text-gray-500">
                      {id.verifiedAt ? "vérifiée" : "non vérifiée"}
                    </span>
                    {canManageOwners && id.primaryEmail !== "yoann@allvaps.fr" && (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => void removeOwner(id.primaryEmail)}
                      >
                        Supprimer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canManageOwners && (
                <div className="flex flex-wrap gap-2">
                  <input
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    placeholder="nouvel OWNER (email)"
                    value={newOwnerEmail}
                    onChange={(e) => setNewOwnerEmail(e.target.value)}
                  />
                  <Button type="button" onClick={() => void addOwner()}>
                    Ajouter
                  </Button>
                </div>
              )}
              {!canManageOwners && (
                <p className="text-xs text-gray-500">
                  Seul le compte OWNER peut ajouter / retirer des adresses.
                </p>
              )}
            </CardBody>
          </Card>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => void send(s)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <Card>
          <CardBody className="flex max-h-[55vh] min-h-[280px] flex-col gap-3 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500">
                Dis bonjour, pose une question, demande un résumé ou un diagnostic —
                A.V.A. conserve le contexte de cette conversation.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={m.id || i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`inline-block max-w-[95%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-brand-50 text-brand-900"
                      : m.status === "error"
                        ? "bg-red-50 text-red-900"
                        : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {m.content}
                  {m.errorCode && (
                    <div className="mt-1 text-[10px] opacity-70">code : {m.errorCode}</div>
                  )}
                </div>
                {m.links && m.links.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {m.links.slice(0, 8).map((l, j) => (
                      <Link
                        key={`${l.href}-${j}`}
                        href={l.href}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <p className="text-sm italic text-gray-500">A.V.A. réfléchit…</p>
            )}
            <div ref={bottomRef} />
          </CardBody>
        </Card>

        {error && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-red-600">
            <span>{error}</span>
            {lastFailedMessage && (
              <Button
                type="button"
                onClick={() =>
                  void send(lastFailedMessage, {
                    confirmSensitive: lastErrorCode === null,
                  })
                }
              >
                Réessayer
              </Button>
            )}
            {lastFailedMessage && messages.some((m) => m.status === "needs_confirm") && (
              <Button
                type="button"
                onClick={() => void send(lastFailedMessage, { confirmSensitive: true })}
              >
                Confirmer (sensible)
              </Button>
            )}
          </div>
        )}

        {(listening || transcriptLive || (handsFree && voicePhase !== "idle")) && (
          <p className="text-sm text-gray-600">
            {voicePhase === "listening" || listening
              ? "🎙️ A.V.A. écoute"
              : voicePhase === "thinking" || loading
                ? "A.V.A. réfléchit…"
                : voicePhase === "speaking"
                  ? "🔊 A.V.A. parle"
                  : ""}
            {transcriptLive ? ` — ${transcriptLive}` : ""}
            {!listening && transcriptLive && !handsFree && (
              <button
                type="button"
                className="ml-2 text-brand-700 hover:underline"
                onClick={() => void send(transcriptLive)}
              >
                Envoyer à A.V.A.
              </button>
            )}
          </p>
        )}
        {(micDenied ||
          (micDiag &&
            micDiag !== "ok" &&
            micDiag !== "aborted" &&
            micDiag !== "no_speech")) && (
          <p className="text-sm text-amber-700">
            {error || "Problème micro — tu peux continuer en texte."}
            {micDiag ? (
              <span className="ml-1 text-[10px] opacity-70">[{micDiag}]</span>
            ) : null}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => {
                setTtsEnabled(e.target.checked);
                if (!e.target.checked && typeof window !== "undefined") {
                  window.speechSynthesis?.cancel();
                  speakingRef.current = false;
                  // Si on coupe TTS pendant une lecture, reprendre l'écoute mains libres
                  if (handsFreeRef.current && !manualStopRef.current && !loadingRef.current) {
                    scheduleHandsFreeRestart(300);
                  }
                }
              }}
            />
            Lire les réponses à voix haute
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={handsFree}
              onChange={(e) => {
                const on = e.target.checked;
                setHandsFree(on);
                handsFreeRef.current = on;
                if (on) {
                  manualStopRef.current = false;
                  pauseRestartRef.current = false;
                  void startListening(true);
                } else {
                  stopListeningManual();
                }
              }}
            />
            Mains libres
          </label>
          {handsFree && (
            <button
              type="button"
              className="text-brand-700 hover:underline"
              onClick={() => stopListeningManual()}
            >
              Arrêter l&apos;écoute
            </button>
          )}
          {ttsEnabled && (
            <button
              type="button"
              className="text-brand-700 hover:underline"
              onClick={() => {
                window.speechSynthesis?.cancel();
                speakingRef.current = false;
                if (handsFreeRef.current && !manualStopRef.current && !loadingRef.current) {
                  scheduleHandsFreeRestart(300);
                } else {
                  setVoicePhase(handsFree ? "listening" : "idle");
                }
              }}
            >
              Arrêter la lecture
            </button>
          )}
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Dis-moi ce que tu as vu, ou ce qu’on regarde…"
            disabled={loading}
            aria-label="Message Admin A.V.A."
          />
          <Button
            type="button"
            disabled={loading && !handsFree}
            onClick={() => {
              if (listening || handsFree) {
                stopListeningManual();
              } else {
                manualStopRef.current = false;
                void startListening(false);
              }
            }}
          >
            {listening || handsFree ? "Stop micro" : "Micro"}
          </Button>
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? "…" : "Envoyer"}
          </Button>
        </form>
      </div>
    </div>
  );
}
