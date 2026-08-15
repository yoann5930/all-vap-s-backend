import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";
import { PreparationWorkstation } from "@/components/admin/PreparationWorkstation";

export const dynamic = "force-dynamic";

export default async function PreparationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { name: true, imageUrl: true } },
        },
      },
    },
  });
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/preparation" className="text-sm text-[#8eb6ff] hover:underline">
          ← Préparation
        </Link>
        <span className="text-[#8b95a5]">·</span>
        <Link href={`/admin/orders/${order.id}`} className="text-sm text-[#8b95a5] hover:underline">
          Fiche commande
        </Link>
      </div>
      <header>
        <h1
          className="text-2xl font-medium text-[#f2f4f7]"
          style={{ fontFamily: "var(--adm-display)" }}
        >
          Préparer #{order.id.slice(-8).toUpperCase()}
        </h1>
        <p className="mt-1 text-sm text-[#8b95a5]">
          {order.customerName || order.customerEmail} ·{" "}
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </p>
      </header>
      <PreparationWorkstation
        orderId={order.id}
        status={order.status}
        items={order.items.map((item) => ({ ...item, variant: null }))}
      />
    </div>
  );
}
