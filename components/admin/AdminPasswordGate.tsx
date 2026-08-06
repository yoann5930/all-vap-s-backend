"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AdminPasswordGate({
  mustChangePassword,
  children,
}: {
  mustChangePassword: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onSecurity = pathname.startsWith("/admin/security");

  useEffect(() => {
    if (mustChangePassword && !onSecurity) {
      router.replace("/admin/security");
    }
  }, [mustChangePassword, onSecurity, router]);

  if (mustChangePassword && !onSecurity) {
    return (
      <p className="text-sm text-amber-700">
        Redirection vers le changement de mot de passe obligatoire…
      </p>
    );
  }

  return <>{children}</>;
}
