import Link from "next/link";
import { Package, ShoppingCart, Users, Settings } from "lucide-react";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [productCount, orderCount, userCount, revenue] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.user.count(),
      prisma.order.aggregate({
        where: { status: "PAID" },
        _sum: { totalCents: true },
      }),
    ]);
    return { productCount, orderCount, userCount, revenue: revenue._sum.totalCents || 0 };
  } catch {
    return { productCount: 0, orderCount: 0, userCount: 0, revenue: 0 };
  }
}

export default async function AdminDashboard() {
  try {
    await requireAuth("ADMIN");
  } catch {
    redirect("/login");
  }

  const stats = await getStats();

  const cards = [
    { label: "Produits", value: stats.productCount, icon: Package, href: "/admin/products" },
    { label: "Commandes", value: stats.orderCount, icon: ShoppingCart, href: "/admin/orders" },
    { label: "Utilisateurs", value: stats.userCount, icon: Users, href: "/admin" },
    { label: "Chiffre d'affaires", value: formatPrice(stats.revenue), icon: Settings, href: "/admin/orders" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
      <p className="mt-1 text-gray-600">Vue d&apos;ensemble de votre boutique All Vap&apos;s</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardBody className="flex items-center gap-4">
                <div className="rounded-lg bg-brand-100 p-3">
                  <card.icon className="h-6 w-6 text-brand-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
