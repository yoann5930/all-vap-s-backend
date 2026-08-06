"use client";

import { useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AdminPasswordGate } from "@/components/admin/AdminPasswordGate";

export function AdminShell({
  email,
  firstName,
  mustChangePassword,
  alertCount,
  children,
}: {
  email: string;
  firstName?: string | null;
  mustChangePassword: boolean;
  alertCount: number;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="admin-app flex min-h-screen">
      <AdminSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          email={email}
          firstName={firstName}
          alertCount={alertCount}
          onMenuOpen={() => setMenuOpen(true)}
        />
        <main className="flex-1 px-4 py-6 lg:px-8">
          <AdminPasswordGate mustChangePassword={mustChangePassword}>
            {children}
          </AdminPasswordGate>
        </main>
      </div>
    </div>
  );
}
