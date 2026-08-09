"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { authFetch } from "@/lib/auth-client";

type Reflection = {
  id: string;
  observation: string;
  hypothesis: string;
  idea: string;
  confidence: number;
  proposedAction: string;
  verdict: string;
  updatedAt: string;
};

type MemoryItem = {
  id: string;
  kind: string;
  subject: string;
  content: string;
  confidence: number;
};

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as {
      error?: string;
      message?: string;
      detail?: string;
      code?: string;
    };
    const parts = [
      data.error || data.message || fallback,
      data.detail,
      data.code ? `(${data.code})` : null,
      `HTTP ${res.status}`,
    ].filter(Boolean);
    return parts.join(" — ");
  } catch {
    return `${fallback} — HTTP ${res.status}`;
  }
}

export default function AdminAvaReflectionsPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [missingData, setMissingData] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/ava/reflections");
      if (!res.ok) throw new Error(await readApiError(res, "Lecture impossible"));
      const data = await res.json();
      setReflections(data.reflections || []);
      setMemory(data.businessMemory || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/ava/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Analyse impossible"));
      }
      const data = await res.json();
      setReflections(data.reflections || []);
      setLastGeneratedAt(data.generatedAt || null);
      setMissingData(Array.isArray(data.missingData) ? data.missingData : []);
      if (data.warning) {
        setError(String(data.warning));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Réflexions A.V.A.</h1>
            <p className="text-sm text-gray-600">
              Synthèses métier structurées — pas de chaîne de pensée privée.
            </p>
            {lastGeneratedAt && (
              <p className="text-xs text-gray-500">
                Dernière analyse : {new Date(lastGeneratedAt).toLocaleString("fr-FR")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ava" className="text-sm text-brand-700 hover:underline">
              ← Chat A.V.A.
            </Link>
            <Link href="/admin/ava/radar" className="text-sm text-brand-700 hover:underline">
              Radar marché
            </Link>
            <Button type="button" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? "Analyse…" : "Relancer l'analyse"}
            </Button>
          </div>
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {missingData.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Données partielles : {missingData.join(", ")}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : reflections.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-gray-600">
            Aucune réflexion enregistrée. Lance une analyse ou dis « fais le tour » dans le chat.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {reflections.map((r) => (
            <Card key={r.id}>
              <CardBody className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {r.verdict}
                  </span>
                  <span className="text-xs text-gray-500">Confiance {r.confidence}%</span>
                </div>
                <p>
                  <span className="font-medium text-gray-900">OBSERVATION — </span>
                  {r.observation}
                </p>
                <p>
                  <span className="font-medium text-gray-900">HYPOTHÈSE — </span>
                  {r.hypothesis}
                </p>
                <p>
                  <span className="font-medium text-gray-900">IDÉE — </span>
                  {r.idea}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">ACTION PROPOSÉE — </span>
                  {r.proposedAction}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {memory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Mémoire métier</h2>
          <div className="space-y-2">
            {memory.slice(0, 12).map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <div className="text-xs font-medium text-gray-500">
                  {m.kind} · {m.subject} · {m.confidence}%
                </div>
                <p className="text-gray-800">{m.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
