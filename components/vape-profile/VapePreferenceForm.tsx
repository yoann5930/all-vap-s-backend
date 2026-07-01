"use client";

import { useState } from "react";
import type { FlavorTag, VapeProfileData } from "@/lib/vape-profile/types";
import {
  DRAW_OPTIONS,
  FLAVOR_OPTIONS,
  GDPR_CONSENT_TEXT,
  MEDICAL_DISCLAIMER,
  VAPE_STATUS_OPTIONS,
  emptyVapeProfile,
} from "@/lib/vape-profile/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface VapePreferenceFormProps {
  initial?: VapeProfileData;
  onSaved: (profile: VapeProfileData) => void;
}

export function VapePreferenceForm({ initial, onSaved }: VapePreferenceFormProps) {
  const [form, setForm] = useState<VapeProfileData>(initial ?? emptyVapeProfile());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFlavor(list: "preferredFlavors" | "avoidedFlavors", tag: FlavorTag) {
    setForm((f) => {
      const arr = f[list];
      return {
        ...f,
        [list]: arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gdprConsent) {
      setError("Vous devez accepter la conservation de vos préférences.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/vape-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onSaved(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium">Statut</label>
        <div className="flex flex-wrap gap-2">
          {VAPE_STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setForm({ ...form, status: o.value })}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                form.status === o.value ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Cigarettes par jour (avant la vape)"
        type="number"
        min={0}
        value={form.cigarettesPerDay ?? ""}
        onChange={(e) => setForm({ ...form, cigarettesPerDay: e.target.value ? Number(e.target.value) : null })}
      />

      <div>
        <label className="mb-2 block text-sm font-medium">Tirage préféré</label>
        <div className="flex flex-wrap gap-2">
          {DRAW_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setForm({ ...form, drawPreference: o.value })}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                form.drawPreference === o.value ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Goûts préférés</label>
        <div className="flex flex-wrap gap-2">
          {FLAVOR_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggleFlavor("preferredFlavors", o.value)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                form.preferredFlavors.includes(o.value) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Goûts à éviter</label>
        <div className="flex flex-wrap gap-2">
          {FLAVOR_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggleFlavor("avoidedFlavors", o.value)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                form.avoidedFlavors.includes(o.value) ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Taux de nicotine conseillé (mg)"
          type="number"
          min={0}
          max={20}
          value={form.advisedNicotineMg ?? ""}
          onChange={(e) => setForm({ ...form, advisedNicotineMg: e.target.value ? Number(e.target.value) : null })}
        />
        <Input
          label="Taux de nicotine utilisé (mg)"
          type="number"
          min={0}
          max={20}
          value={form.usedNicotineMg ?? ""}
          onChange={(e) => setForm({ ...form, usedNicotineMg: e.target.value ? Number(e.target.value) : null })}
        />
      </div>

      <Input
        label="Budget moyen (€)"
        type="number"
        min={0}
        value={form.averageBudgetCents ? form.averageBudgetCents / 100 : ""}
        onChange={(e) =>
          setForm({ ...form, averageBudgetCents: e.target.value ? Number(e.target.value) * 100 : null })
        }
      />

      <label className="flex items-start gap-3 rounded-lg border border-wood-200/60 bg-wood-50/40 p-4 text-sm">
        <input
          type="checkbox"
          required
          checked={form.gdprConsent}
          onChange={(e) => setForm({ ...form, gdprConsent: e.target.checked })}
          className="mt-1"
        />
        <span>{GDPR_CONSENT_TEXT}</span>
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.personalizedEnabled}
          onChange={(e) => setForm({ ...form, personalizedEnabled: e.target.checked })}
        />
        Activer les recommandations personnalisées
      </label>

      <p className="text-xs text-gray-500">{MEDICAL_DISCLAIMER}</p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" loading={loading}>
        Enregistrer mes préférences
      </Button>
    </form>
  );
}
