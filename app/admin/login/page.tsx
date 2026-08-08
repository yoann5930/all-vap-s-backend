"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Une seule connexion All Vap's : /login
 * /admin/login redirige vers /login?next=/admin…
 */
function AdminLoginRedirectInner() {
  const search = useSearchParams();
  useEffect(() => {
    const redirect = search.get("redirect") || search.get("next") || "/admin";
    const safe =
      redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/admin";
    window.location.replace(`/login?next=${encodeURIComponent(safe)}`);
  }, [search]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
      Redirection vers la connexion unique…
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
          Chargement…
        </div>
      }
    >
      <AdminLoginRedirectInner />
    </Suspense>
  );
}
