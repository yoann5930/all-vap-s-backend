export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { default: prisma } = await import("@/lib/prisma");
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log("[All Vap's] Prisma warm-up OK");
    } catch (err) {
      console.warn("[All Vap's] Prisma warm-up skipped:", err);
    }
  }
}
