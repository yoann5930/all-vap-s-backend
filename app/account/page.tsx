"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function AccountOverviewPage() {
  const [user, setUser] = useState<{ email: string; firstName: string | null; loyaltyPoints?: number } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) window.location.href = "/login";
        else {
          setUser(d.user);
          fetch("/api/account/loyalty").then((r) => r.json()).then((l) => {
            setUser((u) => u ? { ...u, loyaltyPoints: l.loyaltyPoints } : u);
          }).catch(() => {});
        }
      });
  }, []);

  if (!user) return <div className="py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-wood-200/60 bg-white p-6">
        <h2 className="text-xl font-semibold">Bienvenue{user.firstName ? `, ${user.firstName}` : ""}</h2>
        <p className="mt-1 text-gray-600">{user.email}</p>
        {user.loyaltyPoints !== undefined && (
          <p className="mt-4 text-sm">
            <span className="font-semibold text-brand-700">{user.loyaltyPoints} points</span> fidélité
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/account/commandes" className="rounded-xl border p-4 hover:border-brand-300 hover:shadow-sm">
          <h3 className="font-semibold">Mes commandes</h3>
          <p className="mt-1 text-sm text-gray-500">Historique et suivi</p>
        </Link>
        <Link href="/account/fidelite" className="rounded-xl border p-4 hover:border-brand-300 hover:shadow-sm">
          <h3 className="font-semibold">Fidélité & QR Code</h3>
          <p className="mt-1 text-sm text-gray-500">Carte membre All Vap&apos;s</p>
        </Link>
      </div>
      <Button href="/boutique">Découvrir la boutique</Button>
    </div>
  );
}
