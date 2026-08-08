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

const SECRET_SPEAK =
  /\b(mot\s*de\s*passe|password|token|api[_-]?key|secret|Bearer\s+\S+|sk-[a-zA-Z0-9_-]+)\b/i;

function speakSafe(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const clean = text
    .replace(SECRET_SPEAK, "[masqué]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[masqué]")
    .slice(0, 1200);
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "fr-FR";
  window.speechSynthesis.speak(u);
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
  const [transcriptLive, setTranscriptLive] = useState("");
  const [micDenied, setMicDenied] = useState(false);
  const [identities, setIdentities] = useState<OwnerIdentity[]>([]);
  const [canManageOwners, setCanManageOwners] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [showIdentities, setShowIdentities] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const handsFreeRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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
    const t = setInterval(() => void load(conversationIdRef.current), 30_000);
    return () => clearInterval(t);
  }, [load, loadIdentities]);

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
    if (!msg || loading) return;
    setLoading(true);
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
          conversationId,
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
      if (ttsEnabled && !data.errorCode) speakSafe(assistantText);

      await load(data.conversationId || conversationId);

      if (handsFreeRef.current && !data.errorCode && !data.needsConfirmation) {
        // Relance écoute après TTS court délai
        setTimeout(() => startListening(true), ttsEnabled ? 2500 : 400);
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
    } finally {
      setLoading(false);
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }

  function startListening(fromHandsFree = false) {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Reconnaissance vocale non supportée sur ce navigateur.");
      return;
    }
    stopListening();
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "fr-FR";
    rec.interimResults = true;
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
        setInput(final.trim());
        if (fromHandsFree || handsFreeRef.current) {
          void send(final.trim());
        }
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") {
        setMicDenied(true);
        setError("Permission micro refusée.");
        setHandsFree(false);
      } else if (ev.error !== "aborted") {
        setError(`Micro : ${ev.error}`);
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setMicDenied(false);
    } catch {
      setError("Impossible de démarrer le micro.");
    }
  }

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
      </aside>

      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">A.V.A.</h1>
          <p className="mt-1 text-sm text-gray-600">
            Assistante administrative interne — conversation persistante, texte et voix.
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

        {(listening || transcriptLive) && (
          <p className="text-sm text-gray-600">
            {listening ? "Écoute en cours… " : ""}
            {transcriptLive}
          </p>
        )}
        {micDenied && (
          <p className="text-sm text-amber-700">
            Permission micro refusée — tu peux continuer en texte.
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
                setHandsFree(e.target.checked);
                if (e.target.checked) startListening(true);
                else stopListening();
              }}
            />
            Mains libres
          </label>
          {ttsEnabled && (
            <button
              type="button"
              className="text-brand-700 hover:underline"
              onClick={() => window.speechSynthesis?.cancel()}
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
            placeholder="Parler à A.V.A.…"
            disabled={loading}
            aria-label="Message Admin A.V.A."
          />
          <Button
            type="button"
            disabled={loading}
            onClick={() => (listening ? stopListening() : startListening(false))}
          >
            {listening ? "Stop micro" : "Micro"}
          </Button>
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? "…" : "Envoyer"}
          </Button>
        </form>
      </div>
    </div>
  );
}
