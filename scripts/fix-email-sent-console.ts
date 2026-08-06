/**
 * Corrige les EmailLog trompeurs : SENT + transport console → SKIPPED.
 * N'envoie rien. N'efface pas l'historique.
 */
import prisma from "../lib/prisma";

async function main() {
  const before = await prisma.emailLog.count({
    where: { status: "SENT", transport: "console" },
  });
  const updated = await prisma.emailLog.updateMany({
    where: { status: "SENT", transport: "console" },
    data: {
      status: "SKIPPED",
      lastErrorCode: "CONSOLE_ONLY_NOT_DELIVERED",
      sentAt: null,
    },
  });
  console.log(
    JSON.stringify(
      {
        foundSentConsole: before,
        corrected: updated.count,
        message: "SENT+console → SKIPPED / CONSOLE_ONLY_NOT_DELIVERED",
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
