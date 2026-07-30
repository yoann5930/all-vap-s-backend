"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-white">Une erreur est survenue</h1>
      <p className="mt-2 text-[#A7B0BC]">All Vap&apos;s — veuillez réessayer.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button
          onClick={() => {
            // Rechargement complet : contourne les erreurs Soft Nav / RSC
            window.location.reload();
          }}
        >
          Réessayer
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            window.location.assign("/e-liquides");
          }}
        >
          Retour e-liquides
        </Button>
      </div>
    </div>
  );
}
