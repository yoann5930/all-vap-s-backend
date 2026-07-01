"use client";

import { Brain, Calendar } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";

interface HistoryItem {
  id: string;
  reason: string;
  createdAt: string;
  product?: { name: string } | null;
  source?: string;
}

interface AssistantMemorySummaryProps {
  greeting?: string | null;
  history: HistoryItem[];
}

export function AssistantMemorySummary({ greeting, history }: AssistantMemorySummaryProps) {
  return (
    <div className="space-y-4">
      {greeting && (
        <Card className="border-brand-200 bg-brand-50/30">
          <CardBody>
            <div className="flex gap-3">
              <Brain className="h-6 w-6 flex-shrink-0 text-brand-600" />
              <p className="text-sm leading-relaxed text-vap-black">{greeting}</p>
            </div>
          </CardBody>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-semibold">Historique des recommandations</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Aucune recommandation enregistrée pour le moment.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
                <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <div>
                  <p className="font-medium">{h.product?.name ?? "Conseil personnalisé"}</p>
                  <p className="text-gray-600">{h.reason}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(h.createdAt).toLocaleDateString("fr-FR")} · {h.source === "assistant" ? "Assistant" : "Moteur local"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
