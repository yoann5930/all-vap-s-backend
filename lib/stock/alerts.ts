import { sendEmail } from "@/lib/email";
import { wrapEmailHtml, wrapEmailText, escapeHtml } from "@/lib/email/layout";
import { logStockEvent } from "./events";
import type { StockAvailability } from "./availability";
import prisma from "@/lib/prisma";

const LOW = Number(process.env.STOCK_LOW_ALERT_THRESHOLD || "5");

function alertEmail(): string {
  return (
    process.env.STOCK_ALERT_EMAIL ||
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    ""
  );
}

/**
 * Alertes stock faible (≤5) et rupture (0).
 * Idempotentes par produit/variante + niveau (évite le spam).
 */
export async function maybeEmitStockAlerts(snap: StockAvailability): Promise<void> {
  if (!snap.known) return;
  const to = alertEmail();
  if (!to || !to.includes("@")) return;

  const keyBase = `${snap.productId}:${snap.variantId || "base"}`;

  if (snap.available <= 0) {
    const idem = `alert:rupture:${keyBase}:${snap.available}`;
    const dup = await prisma.stockEvent.findFirst({
      where: { type: "RUPTURE", message: { contains: idem } },
    }).catch(() => null);
    if (dup) return;

    await logStockEvent({
      type: "RUPTURE",
      message: `${idem} — ${snap.productName}`,
      productId: snap.productId,
      variantId: snap.variantId,
      meta: { available: snap.available },
    });

    const subject = `Rupture — ${snap.productName || "Produit"}`;
    const body = formatAlertBody("Rupture", snap);
    try {
      await sendEmail({
        to,
        subject,
        html: wrapEmailHtml({ title: subject, bodyHtml: body.html }),
        text: wrapEmailText(body.text),
        type: "admin_new_order",
        idempotencyKey: `stock-rupture:${keyBase}`,
      });
    } catch {
      /* ignore */
    }
    return;
  }

  if (snap.available > 0 && snap.available <= LOW) {
    const idem = `alert:low:${keyBase}:${snap.available}`;
    const recent = await prisma.stockEvent.findFirst({
      where: {
        type: "LOW_STOCK",
        productId: snap.productId,
        createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) },
      },
    }).catch(() => null);
    if (recent) return;

    await logStockEvent({
      type: "LOW_STOCK",
      message: `${idem} — ${snap.productName}`,
      productId: snap.productId,
      variantId: snap.variantId,
      meta: { available: snap.available },
    });

    const subject = `Stock faible — ${snap.productName || "Produit"} (${snap.available})`;
    const body = formatAlertBody("Stock faible", snap);
    try {
      await sendEmail({
        to,
        subject,
        html: wrapEmailHtml({ title: subject, bodyHtml: body.html }),
        text: wrapEmailText(body.text),
        type: "admin_new_order",
        idempotencyKey: `stock-low:${keyBase}:${snap.available}`,
      });
    } catch {
      /* ignore */
    }
  }
}

function formatAlertBody(kind: string, snap: StockAvailability) {
  const now = new Date();
  const date = now.toLocaleDateString("fr-FR");
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const text = `${kind}

Produit : ${snap.productName || "—"}
Fabricant : ${snap.manufacturer || "—"}
Gamme : ${snap.range || "—"}
Variante : ${snap.variantLabel || "—"}
EAN : ${snap.ean || "—"}
Stock restant : ${snap.available}
Date : ${date}
Heure : ${time}
`;
  const html = `
    <p><strong>${escapeHtml(kind)}</strong></p>
    <ul>
      <li>Produit&nbsp;: ${escapeHtml(snap.productName || "—")}</li>
      <li>Fabricant&nbsp;: ${escapeHtml(snap.manufacturer || "—")}</li>
      <li>Gamme&nbsp;: ${escapeHtml(snap.range || "—")}</li>
      <li>Variante&nbsp;: ${escapeHtml(snap.variantLabel || "—")}</li>
      <li>EAN&nbsp;: ${escapeHtml(snap.ean || "—")}</li>
      <li>Stock restant&nbsp;: <strong>${snap.available}</strong></li>
      <li>Date&nbsp;: ${escapeHtml(date)} — ${escapeHtml(time)}</li>
    </ul>
  `;
  return { text, html };
}
