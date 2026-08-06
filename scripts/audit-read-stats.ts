import prisma from "../lib/prisma";

async function main() {
  const sentConsole = await prisma.emailLog.count({
    where: { status: "SENT", transport: "console" },
  });
  const sentSmtp = await prisma.emailLog.count({
    where: { status: "SENT", transport: { in: ["smtp", "resend"] } },
  });
  const skippedConsole = await prisma.emailLog.count({
    where: { status: "SKIPPED", lastErrorCode: "CONSOLE_ONLY_NOT_DELIVERED" },
  });
  const auditOrders = await prisma.order.findMany({
    where: { customerEmail: { contains: "allvaps-audit.local" } },
    select: {
      id: true,
      status: true,
      userId: true,
      totalCents: true,
      deliveryMethod: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const docs = await prisma.orderDocument.count({
    where: { orderId: { in: auditOrders.map((o) => o.id) } },
  });
  const dupEvents = await prisma.notificationEvent.count({
    where: { orderId: "AUDIT-DUP-ORDER" },
  });
  const deliveries = await prisma.notificationDelivery.groupBy({
    by: ["status"],
    _count: true,
  });
  const statuses: Record<string, number> = {};
  for (const o of auditOrders) statuses[o.status] = (statuses[o.status] || 0) + 1;

  console.log(
    JSON.stringify(
      {
        sentConsole,
        sentSmtp,
        skippedConsole,
        auditOrders: auditOrders.length,
        auditStatuses: statuses,
        docsForAuditOrders: docs,
        dupEvents,
        deliveries,
        sampleAuditOrders: auditOrders.slice(0, 5),
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
