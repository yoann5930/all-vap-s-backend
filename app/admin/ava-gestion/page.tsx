"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type LinkItem = { label: string; href: string; kind: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  links?: LinkItem[];
  meta?: {
    periodLabel?: string;
    source?: string;
    lastSyncAt?: string | null;
    missingData?: string[];
  };
};

const SUGGESTIONS = [
  "Résumé du jour",
  "Commandes à préparer",
  "Paiements à vérifier",
  "Stocks faibles",
  "Colis en anomalie",
  "Rapport complet",
  "Compare aujourd'hui avec hier",
  "Qu'est-ce que j'ai à faire aujourd'hui ?",
];

export default function AvaGestionPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [periodKey, setPeriodKey] = useState("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ava-gestion");
    if (!res.ok) {
      setError("Accès refusé ou session expirée");
      return;
    }
    const data = await res.json();
    setMessages(
      (data.messages || []).map((m: { role: string; content: string; linksJson?: LinkItem[]; metaJson?: Msg["meta"] }) => ({
        role: m.role,
        content: m.content,
        links: m.linksJson || [],
        meta: m.metaJson,
      }))
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setLoading(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    try {
      const res = await fetch("/api/admin/ava-gestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, periodKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.text,
          links: data.links || [],
          meta: {
            periodLabel: data.periodLabel,
            source: data.source,
            lastSyncAt: data.lastSyncAt,
            missingData: data.missingData,
          },
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function generateReport(sendEmail: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          type: "on_demand",
          periodKey,
          sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur rapport");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Rapport généré : ${data.reportId}\nE-mail : ${data.emailStatus}\nPDF : ${data.pdfPath || "non généré"}\nAchat réel période : ${data.hasRealPurchase ? "oui" : "non"}`,
          links: [{ label: "Voir les rapports", href: "/admin/rapports", kind: "report" }],
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-page max-w-4xl">
      <header className="mb-6">
        <p className="admin-eyebrow">Assistante privée</p>
        <h1 className="admin-h1">A.V.A. Gestion</h1>
        <p className="admin-muted mt-1">
          Mode administration strict — données réelles uniquement, aucune suggestion produit.
        </p>
      </header>

      <div className="admin-card mb-4 flex flex-wrap gap-2 items-center">
        <label className="text-sm admin-muted">Période</label>
        <select
          className="admin-input"
          value={periodKey}
          onChange={(e) => setPeriodKey(e.target.value)}
        >
          <option value="today">Aujourd&apos;hui</option>
          <option value="yesterday">Hier</option>
          <option value="this_week">Cette semaine</option>
          <option value="last_week">Semaine dernière</option>
          <option value="this_month">Ce mois</option>
          <option value="last_month">Mois dernier</option>
          <option value="last_7d">7 derniers jours</option>
          <option value="last_30d">30 derniers jours</option>
        </select>
        <button type="button" className="admin-btn" onClick={() => void generateReport(false)} disabled={loading}>
          Générer rapport
        </button>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void generateReport(true)} disabled={loading}>
          Envoyer par e-mail
        </button>
        <Link href="/admin/rapports" className="admin-btn admin-btn-ghost">
          Historique PDF
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="admin-badge admin-badge-neutral cursor-pointer"
            onClick={() => void send(s)}
            disabled={loading}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="admin-card space-y-4 min-h-[320px] max-h-[60vh] overflow-y-auto mb-4">
        {messages.length === 0 && (
          <p className="admin-muted text-sm">Pose une question de gestion. Ex. « Combien de commandes aujourd&apos;hui ? »</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block text-left whitespace-pre-wrap text-sm rounded-lg px-3 py-2 max-w-full ${
                m.role === "user" ? "bg-[var(--admin-accent)]/20" : "bg-black/30"
              }`}
            >
              {m.content}
            </div>
            {m.meta && (
              <p className="text-xs admin-muted mt-1">
                {m.meta.periodLabel} · {m.meta.source}
                {m.meta.lastSyncAt ? ` · sync ${m.meta.lastSyncAt}` : ""}
              </p>
            )}
            {m.links && m.links.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 justify-start">
                {m.links.slice(0, 12).map((l, j) => (
                  <Link key={`${l.href}-${j}`} href={l.href} className="admin-badge admin-badge-success">
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
            {m.meta?.missingData && m.meta.missingData.length > 0 && (
              <p className="text-xs text-amber-400/90 mt-1">
                Données partielles : {m.meta.missingData.join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="admin-input flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Question de gestion…"
          disabled={loading}
          aria-label="Message A.V.A. Gestion"
        />
        <button type="submit" className="admin-btn" disabled={loading}>
          {loading ? "…" : "Envoyer"}
        </button>
      </form>
      <p className="text-xs admin-muted mt-2">Voix : préparation future — saisie texte active.</p>
    </div>
  );
}
