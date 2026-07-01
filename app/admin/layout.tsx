import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/jwt";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAuth("ADMIN");
  } catch {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-brand-700">Administration All Vap&apos;s</h2>
        </div>
        <Link href="/" className="text-sm text-gray-500 hover:text-brand-700">← Site</Link>
      </div>
      <div className="flex flex-col gap-8 lg:flex-row">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
