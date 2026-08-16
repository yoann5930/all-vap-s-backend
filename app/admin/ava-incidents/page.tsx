"use client";

import { useEffect, useState } from "react";

type Incident = {
  id: string;
  manufacturer: string | null;
  model: string | null;
  symptomFreeText: string;
  riskLevel: string;
  status: string;
  recommendations: string | null;
  knowledgePromoted: boolean;
  mediaIds: string[];
  createdAt: string;
};

export default function AdminAvaIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/ava/incidents");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Accès refusé");
      return;
    }
    setIncidents(json.incidents || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, data: Record<string, unknown>) {
    await fetch("/api/ava/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    await load();
  }

  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Incidents diagnostic A.V.A.</h1>
      <p className="text-sm text-neutral-600">
        Aucune facture / motif admin. Médias non publics.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Date</th>
              <th>Matériel</th>
              <th>Symptôme</th>
              <th>Risque</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} className="border-b align-top">
                <td className="py-2 whitespace-nowrap">
                  {new Date(i.createdAt).toLocaleString("fr-FR")}
                </td>
                <td>
                  {i.manufacturer || "—"} {i.model || ""}
                </td>
                <td className="max-w-xs">{i.symptomFreeText}</td>
                <td>{i.riskLevel}</td>
                <td>{i.status}</td>
                <td className="space-y-1">
                  <button
                    type="button"
                    className="block text-xs underline"
                    onClick={() => void patch(i.id, { status: "transmis_boutique" })}
                  >
                    Transmettre boutique
                  </button>
                  <button
                    type="button"
                    className="block text-xs underline"
                    onClick={() =>
                      void patch(i.id, {
                        knowledgePromoted: true,
                        status: "clos",
                      })
                    }
                  >
                    Valider → connaissance
                  </button>
                  <button
                    type="button"
                    className="block text-xs underline"
                    onClick={() => void patch(i.id, { status: "clos" })}
                  >
                    Clore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
