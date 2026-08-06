/**
 * Test génération PDF documents commande (sans envoi e-mail).
 */
import { PrismaClient } from "@prisma/client";
import { generateAndStoreOrderDocument } from "../lib/documents/service";

const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (!order) {
    console.log("[docs:test] Aucune commande en base — skip.");
    return;
  }
  console.log(`[docs:test] order=${order.id} status=${order.status}`);
  const form = await generateAndStoreOrderDocument(order.id, "ORDER_FORM");
  console.log(`[docs:test] ORDER_FORM ok path=${form.storagePath} bytes=${form.sizeBytes}`);
  const prep = await generateAndStoreOrderDocument(order.id, "PREP_SLIP");
  console.log(`[docs:test] PREP_SLIP ok path=${prep.storagePath}`);
  const del = await generateAndStoreOrderDocument(order.id, "DELIVERY_SLIP");
  console.log(`[docs:test] DELIVERY_SLIP ok path=${del.storagePath}`);
  const inv = await generateAndStoreOrderDocument(order.id, "INVOICE");
  console.log(
    `[docs:test] INVOICE ok path=${inv.storagePath} number=${inv.invoiceNumber}`
  );
}

main()
  .catch((e) => {
    console.error("[docs:test] FAIL", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
