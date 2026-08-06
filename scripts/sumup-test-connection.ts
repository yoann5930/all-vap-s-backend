#!/usr/bin/env tsx
import "./load-env";
import { testSumUpConnection } from "../lib/sumup/api-client";

async function main() {
  const result = await testSumUpConnection();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
