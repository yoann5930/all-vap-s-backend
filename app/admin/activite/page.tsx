import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const [history, emails, customers] = await Promise.all([
    prisma.orderStatusHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        order: { select: { id: true, customerEmail: true } },
        changedBy: { select: { email: true, firstName: true } },
      },
    }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, email: true, firstName: true, createdAt: true },
    }),
  ]);

  type Row = { at: Date; text: string };
  const rows: Row[] = [
    ...history.map((h) => ({
      at: h.createdAt,
      text: `Statut commande #${h.order.id.slice(-8).toUpperCase()} : ${
        h.fromStatus || "—"
      } → ${ORDER_STATUS_LABELS[h.toStatus] || h.toStatus}${
        h.changedBy ? ` (${h.changedBy.firstName || h.changedBy.email})` : " (auto)"
      }`,
    })),
    ...emails.map((e) => ({
      at: e.createdAt,
      text: `E-mail ${e.type} · ${e.status} → ${e.recipientMasked}`,
    })),
    ...customers.map((c) => ({
      at: c.createdAt,
      text: `Nouveau client : ${c.firstName || c.email}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-medium text-[#f2f4f7]"
        style={{ fontFamily: "var(--adm-display)" }}
      >
        Journal d&apos;activité
      </h1>
      <p className="text-sm text-[#8b95a5]">
        Événements réels issus de la base — lecture seule depuis cette interface.
      </p>
      <div className="admin-card p-5">
        <ul className="space-y-3">
          {rows.slice(0, 60).map((r, i) => (
            <li key={i} className="flex gap-4 text-sm border-b border-white/[0.05] pb-3">
              <span className="w-40 shrink-0 text-xs text-[#8b95a5]">
                {r.at.toLocaleString("fr-FR")}
              </span>
              <span className="text-[#f2f4f7]">{r.text}</span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-[#8b95a5]">Aucune activité enregistrée.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
