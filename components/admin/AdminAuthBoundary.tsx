"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { isStaffRole } from "@/lib/admin/roles";

type MeUser = {
  email: string;
  firstName?: string | null;
  role: string;
  mustChangePassword?: boolean;
};

/**
 * Frontière auth admin :
 * - /admin/login : page nue
 * - reste : shell + session staff obligatoire
 * La sécurité réelle reste côté API (requireStaff / requireAuth).
 */
export function AdminAuthBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [ready, setReady] = useState(isLogin);
  const [user, setUser] = useState<MeUser | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (cancelled) return;
        if (!data.user || !isStaffRole(data.user.role)) {
          router.replace(`/admin/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
        setUser(data.user);
        setReady(true);
        // Alertes légères (non bloquant)
        try {
          const s = await fetch("/api/admin/stats");
          if (s.ok) {
            const j = await s.json();
            const n =
              (j.pendingOrders || 0) > 5
                ? 1
                : 0 + (j.lowStock || 0) > 0
                  ? 1
                  : 0 + (j.failedEmails || 0);
            setAlertCount(typeof n === "number" ? Math.min(9, j.failedEmails || 0) + (j.lowStock ? 1 : 0) : 0);
          }
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) router.replace("/admin/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogin, pathname, router]);

  if (isLogin) {
    return <div className="admin-app min-h-screen">{children}</div>;
  }

  if (!ready || !user) {
    return (
      <div className="admin-app flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#8b95a5]">Chargement de l&apos;administration…</p>
      </div>
    );
  }

  return (
    <AdminShell
      email={user.email}
      firstName={user.firstName}
      mustChangePassword={!!user.mustChangePassword}
      alertCount={alertCount}
    >
      {children}
    </AdminShell>
  );
}
