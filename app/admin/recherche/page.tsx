import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";

export const dynamic = "force-dynamic";

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const { q: raw = "" } = await searchParams;
  const q = raw.trim();

  const [orders, customers, products, docs] = q
    ? await Promise.all([
        prisma.order.findMany({
          where: {
            OR: [
              { id: { contains: q } },
              { customerEmail: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { trackingNumber: { contains: q } },
              { invoiceNumber: { contains: q } },
            ],
          },
          take: 15,
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.findMany({
          where: {
            role: "CUSTOMER",
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { qrCode: { contains: q } },
            ],
          },
          take: 15,
        }),
        prisma.product.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 15,
        }),
        prisma.orderDocument.findMany({
          where: {
            OR: [
              { fileName: { contains: q, mode: "insensitive" } },
              { invoiceNumber: { contains: q } },
              { orderId: { contains: q } },
            ],
          },
          take: 10,
        }),
      ])
    : [[], [], [], []];

  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-medium text-[#f2f4f7]"
        style={{ fontFamily: "var(--adm-display)" }}
      >
        Recherche
      </h1>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          className="admin-input max-w-lg"
          placeholder="Commande, client, produit, facture, suivi…"
        />
        <button type="submit" className="admin-btn admin-btn-primary">
          Chercher
        </button>
      </form>

      {!q && <p className="text-sm text-[#8b95a5]">Saisissez un terme de recherche.</p>}

      {q && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="admin-card p-5">
            <h2 className="text-sm font-medium">Commandes ({orders.length})</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="text-[#8eb6ff] hover:underline">
                    #{o.id.slice(-8).toUpperCase()}
                  </Link>{" "}
                  · {ORDER_STATUS_LABELS[o.status]} · {formatPrice(o.totalCents)}
                </li>
              ))}
              {orders.length === 0 && <li className="text-[#8b95a5]">Aucun</li>}
            </ul>
          </section>
          <section className="admin-card p-5">
            <h2 className="text-sm font-medium">Clients ({customers.length})</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {customers.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/customers?q=${encodeURIComponent(c.email)}`}
                    className="text-[#8eb6ff] hover:underline"
                  >
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                  </Link>{" "}
                  · {c.email}
                </li>
              ))}
              {customers.length === 0 && <li className="text-[#8b95a5]">Aucun</li>}
            </ul>
          </section>
          <section className="admin-card p-5">
            <h2 className="text-sm font-medium">Produits ({products.length})</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {products.map((p) => (
                <li key={p.id}>
                  <Link href="/admin/products" className="text-[#8eb6ff] hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
              {products.length === 0 && <li className="text-[#8b95a5]">Aucun</li>}
            </ul>
          </section>
          <section className="admin-card p-5">
            <h2 className="text-sm font-medium">Documents ({docs.length})</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {docs.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/admin/documents/${d.id}`}
                    className="text-[#8eb6ff] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.type} · {d.fileName}
                  </a>
                </li>
              ))}
              {docs.length === 0 && <li className="text-[#8b95a5]">Aucun</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
