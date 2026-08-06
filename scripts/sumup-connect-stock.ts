#!/usr/bin/env tsx
/**
 * Connexion stock SumUp par toutes les voies (CSV inbox + miroir + API transactions).
 */
import "./load-env";
import prisma from "../lib/prisma";
import { connectSumUpStock } from "../lib/sumup/stock-connect";

async function main() {
  const result = await connectSumUpStock({ forceTransactions: true });
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
  process.exit(result.ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
