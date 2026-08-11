"use client";

import { useEffect } from "react";

export default function AvaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ava/error]", error);
  }, [error]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black px-6 text-center">
      <h1 className="text-xl font-semibold text-white">Erreur A.V.A.</h1>
      <pre className="mt-4 max-h-[50vh] w-full max-w-xl overflow-auto rounded border border-amber-500/40 bg-black/80 p-3 text-left text-[11px] text-amber-100 whitespace-pre-wrap">
        {error?.name || "Error"}
        {"\n"}
        {error?.message || "(pas de message)"}
        {"\n"}
        {error?.digest ? `digest: ${error.digest}\n` : ""}
        {error?.stack ? String(error.stack).slice(0, 1800) : ""}
      </pre>
      <button
        type="button"
        className="mt-6 rounded border border-cyan-500/50 px-4 py-2 text-sm text-cyan-100"
        onClick={() => window.location.reload()}
      >
        Réessayer
      </button>
    </div>
  );
}
