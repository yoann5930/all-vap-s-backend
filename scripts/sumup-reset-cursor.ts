import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const state = await prisma.sumUpSyncState.update({
    where: { id: "default" },
    data: {
      lastTransactionTime: null,
      lastTransactionId: null,
    },
  });

  const deletedSkipped = await prisma.sumUpSyncedTransaction.deleteMany({
    where: { processingStatus: "skipped" },
  });

  console.log(
    JSON.stringify({
      resetCursor: true,
      previousLastSync: state.lastSuccessfulSyncAt,
      deletedSkipped: deletedSkipped.count,
    })
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
