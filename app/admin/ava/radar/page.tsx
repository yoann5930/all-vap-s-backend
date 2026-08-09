"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { authFetch } from "@/lib/auth-client";

type Signal = {
  id: string;
  category: string;
  title: string;
  information: string;
  source: string;
  sourceUrl?: string;
  date: string;
  confidence: number;
  importProduct: false;
};

const SECTIONS: { key: string; label: string; match: string[] }[] = [
  { key: "nouveaute", label: "NOUVEAUTÉS", match: ["nouveaute"] },
  { key: "tendance", label: "TENDANCES", match: ["tendance"] },
  { key: "fabricant", label: "FABRICANTS À SURVEILLER", match: ["fabricant"] },
  { key: "produit", label: "PRODUITS À SURVEILLER", match: ["produit"] },
  { key: "opportunite", label: "OPPORTUNITÉS", match: ["opportunite"] },
  { key: "risque", label: "RISQUES", match: ["risque"] },
  { key: "catalogue", label: "ÉVOLUTIONS CATALOGUE", match: ["catalogue"] },
];

export default function AdminAvaRadarPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/ava/radar");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          [body.error || body.message || "Lecture impossible", body.detail, `HTTP ${res.status}`]
            .filter(Boolean)
            .join(" — ")
        );
      }
      const data = await res.json();
      setSignals(data.signals || []);
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
      const res = await authFetch("/api/admin/ava/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          [body.error || body.message || "Veille impossible", body.detail, `HTTP ${res.status}`]
            .filter(Boolean)
            .join(" — ")
        );
      }
      const data = await res.json();
      setSignals(data.signals || []);
      setMissing(data.missingData || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRefreshing(false);
    }
  }

  const bySection = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      items: signals.filter((x) => s.match.includes(x.category)),
    }));
  }, [signals]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Radar marché</h1>
            <p className="text-sm text-gray-600">
              Veille publique — observation seulement. Aucun import produit automatique.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ava" className="text-sm text-brand-700 hover:underline">
              ← Chat A.V.A.
            </Link>
            <Link href="/admin/ava/reflections" className="text-sm text-brand-700 hover:underline">
              Réflexions
            </Link>
            <Button type="button" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? "Veille…" : "Actualiser la veille"}
            </Button>
          </div>
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Sources partielles : {missing.slice(0, 4).join(" · ")}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="space-y-6">
          {bySection.map((section) => (
            <section key={section.key} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {section.label}
              </h2>
              {section.items.length === 0 ? (
                <p className="text-sm text-gray-400">{"Aucun signal pour l'instant."}</p>
              ) : (
                section.items.map((s) => (
                  <Card key={s.id}>
                    <CardBody className="space-y-1 text-sm">
                      <div className="font-medium text-gray-900">{s.title}</div>
                      <p className="text-gray-700">{s.information}</p>
                      <p className="text-xs text-gray-500">
                        Source : {s.source}
                        {s.sourceUrl ? (
                          <>
                            {" · "}
                            <a
                              href={s.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-700 hover:underline"
                            >
                              lien
                            </a>
                          </>
                        ) : null}
                        {" · "}
                        confiance {s.confidence}% · import auto : jamais
                      </p>
                    </CardBody>
                  </Card>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
