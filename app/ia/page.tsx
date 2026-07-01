"use client";

import { useState } from "react";
import Link from "next/link";
import { AI_SERVICES } from "@/lib/ai";
import { MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function IAPage() {
  const [service, setService] = useState(AI_SERVICES[0].id);
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, message }),
      });
      const data = await res.json();
      setResponse(data.content);
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-vap-black">Assistant All Vap&apos;s</h1>
      <p className="mt-2 text-gray-600">
        Conseils vape personnalisés selon votre profil.{" "}
        <Link href="/compte/profil-vape" className="font-medium text-brand-700 hover:underline">
          Gérer mon profil vape
        </Link>
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {AI_SERVICES.filter((s) => s.id !== "pokemon-estimator").map((s) => (
          <button
            key={s.id}
            onClick={() => setService(s.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${service === s.id ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex : Je suis débutant, j'aime les saveurs fruitées et fraîches, tirage serré, 6 mg de nicotine..."
          rows={4}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none"
          required
        />
        <Button type="submit" loading={loading}>Envoyer</Button>
      </form>

      {response && (
        <Card className="mt-6">
          <CardBody>
            <p className="text-sm leading-relaxed">{response}</p>
            {suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <span key={s} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <p className="mt-6 text-xs text-gray-500">{MEDICAL_DISCLAIMER}</p>
    </div>
  );
}
