"use client";

import { useSearchParams } from "next/navigation";

/** Messages explicites — ne jamais masquer un échec d’auth par un bounce silencieux. */
export function LoginReasonBanner() {
  const params = useSearchParams();
  const reason = params.get("reason");

  if (!reason) return null;

  const message =
    reason === "session"
      ? "Session absente ou expirée — reconnectez-vous."
      : reason === "role"
        ? "Compte connecté mais non autorisé à accéder à l’inventaire."
        : reason === "network"
          ? "Impossible de vérifier la session (réseau). Réessayez."
          : null;

  if (!message) return null;

  return (
    <div className="mx-auto mb-4 w-full max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      {message}
    </div>
  );
}
