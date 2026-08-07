"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

type LinkItem = { label: string; href: string; kind?: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  links?: LinkItem[];
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
  currentApp?: string | null;
};

export function AdminAvaChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<AvaStatus | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ava/chat", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 || res.status === 403 ? "Accès Admin requis" : "Chargement impossible");
      return;
    }
    const data = await res.json();
    setMessages(
      (data.messages || []).map(
        (m: { role: string; content: string; linksJson?: LinkItem[]; links?: LinkItem[] }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          links: m.links || m.linksJson || [],
        })
      )
    );
    setStatus(data.status || null);
    setAgent(data.agent || null);
    setOnline(!!data.online);
    setSuggestions(data.suggestions || []);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setLoading(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    try {
      const res = await fetch("/api/admin/ava/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.text, links: data.links || [] },
      ]);
      if (data.status) setStatus(data.status);
      if (data.agent) setAgent(data.agent);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = agent?.suspended
    ? "Suspendue"
    : online
      ? "Online"
      : status?.orchestratorReachable
        ? "Occupée / VM arrêtée"
        : "Offline";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">A.V.A.</h1>
        <p className="mt-1 text-sm text-gray-600">
          Conversation admin All Vap&apos;s — assistante interne, hors mode vendeuse / client.
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
          <span className="text-gray-600">Rôle : {status?.role || "—"}</span>
          <span className="text-gray-500">
            Dernière action : {agent?.lastAction || "—"}
          </span>
          {(agent?.lastError || status?.lastError) && (
            <span className="text-red-600">Erreur : {agent?.lastError || status?.lastError}</span>
          )}
          <Link href="/admin/fidelatoo/control-center" className="text-brand-700 hover:underline">
            Centre de contrôle
          </Link>
        </CardBody>
      </Card>

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
              Dis bonjour, pose une question, demande un résumé, un diagnostic ou l&apos;état de la VM —
              A.V.A. te répond en conversation, avec les données admin réelles.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <div
                className={`inline-block max-w-[95%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-brand-50 text-brand-900"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {m.content}
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
          <div ref={bottomRef} />
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? "…" : "Envoyer"}
        </Button>
      </form>
    </div>
  );
}
