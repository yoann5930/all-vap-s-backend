"use client";

import type { VapeProfileData } from "@/lib/vape-profile/types";
import {
  drawLabel,
  flavorLabels,
  statusLabel,
  MEDICAL_DISCLAIMER,
} from "@/lib/vape-profile/types";
import { formatPrice } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";

interface CustomerVapeProfileProps {
  profile: VapeProfileData;
  favoriteNames?: string[];
  advisedProductNames?: string[];
  triedProductNames?: string[];
}

export function CustomerVapeProfile({
  profile,
  favoriteNames = [],
  advisedProductNames = [],
  triedProductNames = [],
}: CustomerVapeProfileProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Statut" value={statusLabel(profile.status)} />
        <StatCard label="Cigarettes / jour" value={profile.cigarettesPerDay?.toString() ?? "—"} />
        <StatCard label="Tirage" value={drawLabel(profile.drawPreference)} />
        <StatCard label="Nicotine conseillée" value={profile.advisedNicotineMg != null ? `${profile.advisedNicotineMg} mg` : "—"} />
        <StatCard label="Nicotine utilisée" value={profile.usedNicotineMg != null ? `${profile.usedNicotineMg} mg` : "—"} />
        <StatCard label="Budget moyen" value={profile.averageBudgetCents ? formatPrice(profile.averageBudgetCents) : "—"} />
      </div>

      <Card>
        <CardBody className="space-y-3 text-sm">
          <Row label="Goûts préférés" value={flavorLabels(profile.preferredFlavors)} />
          <Row label="Goûts à éviter" value={flavorLabels(profile.avoidedFlavors)} />
          <Row label="Favoris" value={favoriteNames.join(", ") || "—"} />
          <Row label="Matériel déjà conseillé" value={advisedProductNames.join(", ") || "—"} />
          <Row label="Produits déjà essayés" value={triedProductNames.join(", ") || "—"} />
          <Row
            label="Dernière recommandation"
            value={profile.lastRecommendationAt ? new Date(profile.lastRecommendationAt).toLocaleDateString("fr-FR") : "—"}
          />
        </CardBody>
      </Card>

      <p className="text-xs text-gray-500">{MEDICAL_DISCLAIMER}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-wood-200/60 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-vap-black">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <span className="font-medium text-gray-600">{label}</span>
      <span className="text-vap-black">{value}</span>
    </div>
  );
}
