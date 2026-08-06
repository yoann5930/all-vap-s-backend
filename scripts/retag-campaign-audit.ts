/**
 * Marque les commandes E2E de la campagne comme isAudit (correction post-bug).
 * Ne supprime rien.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const campaignId = "CLIENT-TEST-ACHAT-20260730073502";
const orderIds = [
  "cms7785hz000fut045ykhjjby",
  "cms778ho60029ut046owwsb91",
  "cms778rnq003zut044ndgpygb",
];

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const updated = [];
  for (const id of orderIds) {
    const o = await prisma.order.update({
      where: { id },
      data: {
        isAudit: true,
        auditCampaignId: campaignId,
        loyaltyPointsEarn: 0,
      },
      select: {
        id: true,
        isAudit: true,
        auditCampaignId: true,
        status: true,
        totalCents: true,
        deliveryMethod: true,
      },
    });
    updated.push(o);
  }
  const dir = join("docs/test-client", campaignId, "evidence");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "93-orders-retag-audit.json"), JSON.stringify(updated, null, 2));
  console.log(JSON.stringify(updated, null, 2));
  await prisma.$disconnect();
}
main();
