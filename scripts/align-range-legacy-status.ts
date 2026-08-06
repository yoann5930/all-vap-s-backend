import prisma from "../lib/prisma";

async function main() {
  const n = await prisma.$executeRawUnsafe(`
    UPDATE "ProductRange"
    SET status = 'verifie'
    WHERE "verificationStatus" = 'OFFICIAL_CONFIRMED'
  `);
  console.log({ status_verifie: n });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
