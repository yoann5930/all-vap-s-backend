#!/usr/bin/env tsx
import "./load-env";
import prisma from "../lib/prisma";
import { runSumUpSync } from "../lib/sumup/sync-service";

async function main() {
  const result = await runSumUpSync({ dryRun: false, force: true, lockOwner: "cli-sync-once" });
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
  process.exit(result.ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
