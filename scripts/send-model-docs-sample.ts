/**
 * Envoi test : 1 bon de commande + 1 bon de préparation + 1 facture
 * vers allvaps70@gmail.com
 */
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
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

// Envoi réel vers la boîte demandée (pas de redirection test)
process.env.MAIL_TEST_MODE = "false";
process.env.MAIL_ENABLED = "true";
process.env.EMAIL_TRANSPORT = process.env.EMAIL_TRANSPORT || "smtp";

const TO = "allvaps70@gmail.com";
const ORDER_ID = process.argv[2] || "cms7a1vmh000futawxdno3ftw";

async function main() {
  const { generateAndStoreOrderDocument } = await import("../lib/documents/service");
  const { sendEmail } = await import("../lib/email/service");
  const { maskEmail } = await import("../lib/email/mask");

  console.log(`Régénération PDF commande=${ORDER_ID} → ${maskEmail(TO)}`);

  const types = [
    { type: "ORDER_FORM" as const, label: "Bon de commande" },
    { type: "PREP_SLIP" as const, label: "Bon de préparation" },
    { type: "INVOICE" as const, label: "Facture" },
  ];

  const results = [];
  for (const t of types) {
    const doc = await generateAndStoreOrderDocument(ORDER_ID, t.type);
    const abs = path.join(process.cwd(), doc.storagePath);
    const bytes = await readFile(abs);
    const stamp = Date.now();
    const result = await sendEmail({
      to: TO,
      subject: `[ESSAI MODÈLE] ${t.label} — All Vap's n°${ORDER_ID.slice(-8).toUpperCase()}`,
      html: `<p>Essai modèle document <strong>${t.label}</strong>.</p><p>Commande ${ORDER_ID.slice(-8).toUpperCase()}</p><p>Pièce jointe PDF brandée All Vap's.</p>`,
      text: `Essai modèle ${t.label} — commande ${ORDER_ID.slice(-8).toUpperCase()}`,
      type: "admin_test",
      relatedOrderId: ORDER_ID,
      idempotencyKey: `model-sample:${t.type}:${ORDER_ID}:${TO}:${stamp}`,
      attachments: [
        {
          filename: doc.fileName,
          content: bytes,
          contentType: "application/pdf",
        },
      ],
    });
    results.push({
      type: t.type,
      label: t.label,
      transport: result.transport,
      messageId: result.messageId || null,
      redirectedToTest: result.redirectedToTest === true,
      file: doc.storagePath,
      size: bytes.length,
    });
    console.log(JSON.stringify(results[results.length - 1]));
  }

  console.log(
    JSON.stringify(
      {
        toMasked: maskEmail(TO),
        note: "Adresse demandée gmail.fr interprétée comme gmail.com",
        results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
