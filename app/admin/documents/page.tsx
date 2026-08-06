import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  try {
    await requireAuth("ADMIN");
  } catch {
    redirect("/login?redirect=/admin/documents");
  }

  const docs = await prisma.orderDocument.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: { select: { id: true, customerEmail: true, invoiceNumber: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Documents commandes</h1>
      <p className="mt-1 text-sm text-gray-500">
        Bons de commande, préparation, livraison et factures générés réellement (PDF).
      </p>
      <div className="mt-6 space-y-3">
        {docs.length === 0 && <p className="text-gray-500">Aucun document pour le moment.</p>}
        {docs.map((d) => (
          <Card key={d.id}>
            <CardBody className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-medium">
                  {d.type} · #{d.orderId.slice(-8).toUpperCase()}
                </p>
                <p className="text-gray-500">
                  {d.order.customerEmail}
                  {d.invoiceNumber ? ` · ${d.invoiceNumber}` : ""}
                  {d.gmailLabel ? ` · Gmail : ${d.gmailLabel}` : ""}
                </p>
              </div>
              <a
                href={`/api/admin/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand-700 underline"
              >
                Ouvrir PDF
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
