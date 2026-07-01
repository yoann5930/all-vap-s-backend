"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VapeProfileData } from "@/lib/vape-profile/types";
import { emptyVapeProfile, MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";
import { CustomerVapeProfile } from "@/components/vape-profile/CustomerVapeProfile";
import { VapePreferenceForm } from "@/components/vape-profile/VapePreferenceForm";
import { RecommendationEngine } from "@/components/vape-profile/RecommendationEngine";
import { AssistantMemorySummary } from "@/components/vape-profile/AssistantMemorySummary";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

interface ProfileContext {
  profile: VapeProfileData;
  favorites: Array<{ name: string }>;
  history: Array<{ id: string; reason: string; createdAt: string; product?: { name: string } | null; source?: string }>;
  hasProfile: boolean;
}

export function VapeProfilePageClient() {
  const router = useRouter();
  const [ctx, setCtx] = useState<ProfileContext | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/account/vape-profile")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setCtx(d);
        setLoading(false);
      });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirm("Supprimer définitivement votre profil vape et l'historique des recommandations ?")) return;
    await fetch("/api/account/vape-profile", { method: "DELETE" });
    setCtx({ profile: emptyVapeProfile(), favorites: [], history: [], hasProfile: false });
    setEditing(true);
  }

  async function togglePersonalized(enabled: boolean) {
    await fetch("/api/account/vape-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalizedEnabled: enabled }),
    });
    load();
  }

  if (loading) {
    return <p className="text-gray-500">Chargement du profil vape...</p>;
  }

  if (!ctx) return null;

  const profile = ctx.profile;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Profil vape</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mémoire client de l&apos;Assistant All Vap&apos;s — conseils indicatifs personnalisés.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ctx.hasProfile && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
                {editing ? "Voir le profil" : "Modifier mes réponses"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => togglePersonalized(!profile.personalizedEnabled)}
              >
                {profile.personalizedEnabled ? "Désactiver les reco." : "Activer les reco."}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete}>
                Supprimer le profil
              </Button>
            </>
          )}
        </div>
      </div>

      {editing || !ctx.hasProfile ? (
        <Card>
          <CardBody>
            <h3 className="mb-4 font-semibold">{ctx.hasProfile ? "Modifier mes préférences" : "Mes préférences"}</h3>
            <VapePreferenceForm
              initial={profile}
              onSaved={(p) => {
                setEditing(false);
                setCtx((c) => c ? { ...c, profile: p, hasProfile: true } : c);
                load();
              }}
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <section>
            <h3 className="mb-4 text-lg font-semibold">Mes préférences</h3>
            <CustomerVapeProfile
              profile={profile}
              favoriteNames={ctx.favorites.map((f) => f.name)}
            />
          </section>

          <section>
            <h3 className="mb-4 text-lg font-semibold">Mon dosage conseillé</h3>
            <Card>
              <CardBody className="text-sm">
                <p>
                  Nicotine conseillée : <strong>{profile.advisedNicotineMg != null ? `${profile.advisedNicotineMg} mg` : "—"}</strong>
                </p>
                <p className="mt-1">
                  Nicotine utilisée : <strong>{profile.usedNicotineMg != null ? `${profile.usedNicotineMg} mg` : "—"}</strong>
                </p>
                <p className="mt-3 text-xs text-gray-500">{MEDICAL_DISCLAIMER}</p>
              </CardBody>
            </Card>
          </section>

          <section>
            <RecommendationEngine enabled={profile.personalizedEnabled && profile.gdprConsent} />
          </section>

          <section>
            <AssistantMemorySummary history={ctx.history} />
          </section>
        </>
      )}

      <p className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-900">
        {MEDICAL_DISCLAIMER}
      </p>
    </div>
  );
}
