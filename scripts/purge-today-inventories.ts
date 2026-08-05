/**
 * Annule / purge les sessions d’inventaire démarrées aujourd’hui (essais).
 * Usage: npx tsx scripts/purge-today-inventories.ts
 */
import prisma from "../lib/prisma";

async function main() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const sessions = await prisma.inventorySession.findMany({
    where: { startedAt: { gte: start } },
    select: {
      id: true,
      employeeName: true,
      status: true,
      startedAt: true,
      _count: { select: { lines: true } },
    },
  });

  console.log(`Sessions aujourd’hui: ${sessions.length}`);
  for (const s of sessions) {
    console.log(
      `- ${s.id} | ${s.employeeName} | ${s.status} | lines=${s._count.lines} | ${s.startedAt.toISOString()}`
    );
  }

  if (!sessions.length) {
    console.log("Rien à supprimer.");
    return;
  }

  // Soft cancel d’abord
  const cancelled = await prisma.inventorySession.updateMany({
    where: {
      startedAt: { gte: start },
      status: { in: ["OPEN", "COMPLETED"] },
    },
    data: {
      status: "CANCELLED",
      notes: `purge_essais_jour=${new Date().toISOString()}`,
      updatedAt: new Date(),
    },
  });
  console.log(`Annulées (CANCELLED): ${cancelled.count}`);

  // Suppression dure des essais (cascade lines/photos)
  const deleted = await prisma.inventorySession.deleteMany({
    where: { startedAt: { gte: start } },
  });
  console.log(`Supprimées: ${deleted.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect?.().catch(() => undefined);
  });
