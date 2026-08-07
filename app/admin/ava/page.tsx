import type { Metadata } from "next";
import { AdminAvaChatPanel } from "@/components/admin/ava/AdminAvaChatPanel";

export const metadata: Metadata = {
  title: "A.V.A. — Admin All Vap's",
  robots: { index: false, follow: false },
};

export default function AdminAvaPage() {
  return <AdminAvaChatPanel />;
}
