import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  // Rejouer les transactions marquées skipped sans vente appliquée (échec StockLevel)
  const deleted = await prisma.sumUpSyncedTransaction.deleteMany({
    where: {
      processingStatus: "skipped",
      linesProcessed: 0,
    },
  });
  console.log(JSON.stringify({ deletedSkipped: deleted.count }));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
