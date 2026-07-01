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
      <h1 className="text-2xl font-bold text-vap-black">Une erreur est survenue</h1>
      <p className="mt-2 text-gray-600">All Vap&apos;s — veuillez réessayer.</p>
      <Button className="mt-6" onClick={reset}>Réessayer</Button>
    </div>
  );
}
