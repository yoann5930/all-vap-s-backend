import type { Metadata } from "next";
import { AdminAuthBoundary } from "@/components/admin/AdminAuthBoundary";
import "./admin-theme.css";

export const metadata: Metadata = {
  title: "Administration All Vap's",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminAuthBoundary>{children}</AdminAuthBoundary>;
}
