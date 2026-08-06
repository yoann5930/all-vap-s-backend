/**
 * Générateurs PDF premium All Vap's (A4) — BC / Préparation / Facture.
 * Charte : noir, blanc, or — logo officiel embarqué.
 */
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { OrderDocumentType } from "@prisma/client";
import { orderStatusLabel } from "@/lib/orders/status";
import {
  DOC_BLACK,
  DOC_GOLD,
  DOC_INK,
  DOC_MUTED,
  DOC_ROW,
  DOC_WHITE,
  deliveryMethodLabel,
  getCompanyIdentity,
  paymentMethodLabel,
} from "@/lib/documents/brand";

type OrderForPdf = {
  id: string;
  createdAt: Date;
  status: string;
  customerName: string | null;
  customerEmail: string;
  shippingAddress: string | null;
  deliveryMethod: string | null;
  pickupStoreId: string | null;
  trackingNumber: string | null;
  paymentProvider: string | null;
  totalCents: number;
  shippingCents: number;
  discountCents: number;
  invoiceNumber: string | null;
  items: Array<{
    quantity: number;
    priceCents: number;
    product: { name: string; sku: string | null };
    variant: {
      name: string;
      nicotineLabel: string | null;
      nicotineMg: number | null;
    } | null;
  }>;
};

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const HEADER_H = 78;
const FOOTER_H = 42;

function c(color: { r: number; g: number; b: number }): RGB {
  return rgb(color.r, color.g, color.b);
}

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function shortRef(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function dosageOf(item: OrderForPdf["items"][0]): string {
  if (!item.variant) return "—";
  if (item.variant.nicotineLabel) return item.variant.nicotineLabel;
  if (item.variant.nicotineMg != null) return `${item.variant.nicotineMg} mg`;
  return item.variant.name || "—";
}

function designationOf(item: OrderForPdf["items"][0]): string {
  const v = item.variant?.name ? ` — ${item.variant.name}` : "";
  return `${item.product.name}${v}`;
}

async function loadFonts(pdf: PDFDocument): Promise<{
  body: PDFFont;
  bold: PDFFont;
  display: PDFFont;
}> {
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const identity = getCompanyIdentity();
  for (const candidate of identity.displayFontCandidates) {
    if (!existsSync(candidate)) continue;
    try {
      const bytes = await readFile(candidate);
      const display = await pdf.embedFont(bytes);
      return { body, bold, display };
    } catch {
      /* try next */
    }
  }
  return { body, bold, display: bold };
}

async function embedLogo(pdf: PDFDocument) {
  const logoPath = getCompanyIdentity().logoPath;
  if (!existsSync(logoPath)) return null;
  try {
    const bytes = await readFile(logoPath);
    return await pdf.embedPng(bytes);
  } catch {
    try {
      const bytes = await readFile(logoPath);
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

function drawHeader(
  page: PDFPage,
  fonts: { body: PDFFont; bold: PDFFont; display: PDFFont },
  title: string,
  metaLeft: string,
  metaRight: string,
  logo: Awaited<ReturnType<typeof embedLogo>>
) {
  const company = getCompanyIdentity();
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: c(DOC_BLACK),
  });

  if (logo) {
    const maxH = 48;
    const scale = maxH / logo.height;
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, {
      x: MARGIN,
      y: PAGE_H - HEADER_H + (HEADER_H - h) / 2,
      width: w,
      height: h,
    });
    page.drawText(company.name, {
      x: MARGIN + w + 10,
      y: PAGE_H - 34,
      size: 16,
      font: fonts.display,
      color: c(DOC_GOLD),
    });
    page.drawText(`— ${company.tagline} —`, {
      x: MARGIN + w + 10,
      y: PAGE_H - 50,
      size: 7,
      font: fonts.body,
      color: c(DOC_GOLD),
    });
  } else {
    page.drawText(company.name, {
      x: MARGIN,
      y: PAGE_H - 34,
      size: 18,
      font: fonts.display,
      color: c(DOC_GOLD),
    });
    page.drawText(`— ${company.tagline} —`, {
      x: MARGIN,
      y: PAGE_H - 50,
      size: 8,
      font: fonts.body,
      color: c(DOC_GOLD),
    });
  }

  const titleSize = 18;
  const titleW = fonts.display.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: PAGE_W - MARGIN - titleW,
    y: PAGE_H - 32,
    size: titleSize,
    font: fonts.display,
    color: c(DOC_GOLD),
  });

  const boxW = 210;
  const boxH = 28;
  const boxX = PAGE_W - MARGIN - boxW;
  const boxY = PAGE_H - HEADER_H + 8;
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: c(DOC_BLACK),
    borderColor: c(DOC_GOLD),
    borderWidth: 0.8,
  });
  page.drawText(metaLeft, {
    x: boxX + 6,
    y: boxY + 15,
    size: 7,
    font: fonts.bold,
    color: c(DOC_GOLD),
  });
  page.drawText(metaRight, {
    x: boxX + 6,
    y: boxY + 5,
    size: 7,
    font: fonts.body,
    color: c(DOC_GOLD),
  });
}

function drawFooter(
  page: PDFPage,
  fonts: { body: PDFFont; display: PDFFont },
  tagline: string
) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: FOOTER_H,
    color: c(DOC_BLACK),
  });
  const size = 10;
  const w = fonts.display.widthOfTextAtSize(tagline, size);
  page.drawText(tagline, {
    x: (PAGE_W - w) / 2,
    y: 16,
    size,
    font: fonts.display,
    color: c(DOC_GOLD),
  });
}

function drawSectionLabel(
  page: PDFPage,
  fonts: { bold: PDFFont },
  label: string,
  x: number,
  y: number
) {
  page.drawText(label, {
    x,
    y,
    size: 8,
    font: fonts.bold,
    color: c(DOC_MUTED),
  });
}

function drawWrapped(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: RGB,
  lineGap = 3
): number {
  const words = text.split(/\s+/);
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cy, size, font, color });
      cy -= size + lineGap;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cy, size, font, color });
    cy -= size + lineGap;
  }
  return cy;
}

function drawCheckbox(
  page: PDFPage,
  fonts: { body: PDFFont },
  label: string,
  x: number,
  y: number
) {
  page.drawRectangle({
    x,
    y: y - 1,
    width: 9,
    height: 9,
    borderColor: c(DOC_INK),
    borderWidth: 0.8,
    color: c(DOC_WHITE),
  });
  page.drawText(label, {
    x: x + 14,
    y,
    size: 9,
    font: fonts.body,
    color: c(DOC_INK),
  });
}

export async function buildBrandedOrderPdf(
  order: OrderForPdf,
  type: OrderDocumentType,
  invoiceNumber?: string | null
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const fonts = await loadFonts(pdf);
  const logo = await embedLogo(pdf);
  const company = getCompanyIdentity();
  const dateStr = order.createdAt.toLocaleDateString("fr-FR");
  const orderNo = `AV-${order.createdAt.getFullYear()}-${shortRef(order.id)}`;
  const invNo = invoiceNumber || order.invoiceNumber || orderNo;

  if (type === "ORDER_FORM") {
    drawHeader(
      page,
      fonts,
      "BON DE COMMANDE",
      `N° COMMANDE : ${orderNo}`,
      `DATE : ${dateStr}`,
      logo
    );
  } else if (type === "PREP_SLIP") {
    drawHeader(
      page,
      fonts,
      "BON DE PRÉPARATION",
      `N° COMMANDE : ${orderNo}`,
      `DATE : ${dateStr}`,
      logo
    );
  } else if (type === "INVOICE") {
    drawHeader(
      page,
      fonts,
      "FACTURE",
      `N° FACTURE : ${invNo}`,
      `DATE : ${dateStr}`,
      logo
    );
  } else {
    drawHeader(
      page,
      fonts,
      "BON DE LIVRAISON",
      `N° COMMANDE : ${orderNo}`,
      `DATE : ${dateStr}`,
      logo
    );
  }

  let y = PAGE_H - HEADER_H - 28;
  const colW = (PAGE_W - MARGIN * 2 - 16) / 2;

  // Parties
  if (type === "PREP_SLIP") {
    const w = (PAGE_W - MARGIN * 2 - 20) / 3;
    drawSectionLabel(page, fonts, "CLIENT", MARGIN, y);
    drawSectionLabel(page, fonts, "LIVRAISON", MARGIN + w + 10, y);
    drawSectionLabel(page, fonts, "PAIEMENT", MARGIN + 2 * (w + 10), y);
    y -= 12;
    const yClient = drawWrapped(
      page,
      fonts.body,
      `${order.customerName || "Client"} · ${order.customerEmail}`,
      MARGIN,
      y,
      w - 4,
      8,
      c(DOC_INK)
    );
    const yShip = drawWrapped(
      page,
      fonts.body,
      `${deliveryMethodLabel(order.deliveryMethod)}${order.shippingAddress ? ` — ${order.shippingAddress}` : ""}`,
      MARGIN + w + 10,
      y,
      w - 4,
      8,
      c(DOC_INK)
    );
    const px = MARGIN + 2 * (w + 10);
    page.drawText(paymentMethodLabel(order.paymentProvider), {
      x: px,
      y,
      size: 8,
      font: fonts.body,
      color: c(DOC_INK),
    });
    page.drawRectangle({
      x: px,
      y: y - 22,
      width: 52,
      height: 14,
      color: c(DOC_BLACK),
    });
    page.drawText("PAYÉ", {
      x: px + 12,
      y: y - 18,
      size: 8,
      font: fonts.bold,
      color: c(DOC_WHITE),
    });
    y = Math.min(yClient, yShip, y - 30) - 10;
  } else {
    const leftLabel = type === "INVOICE" ? "VENDEUR" : "ÉMETTEUR";
    drawSectionLabel(page, fonts, leftLabel, MARGIN, y);
    drawSectionLabel(page, fonts, "CLIENT", MARGIN + colW + 16, y);
    y -= 12;
    const sellerLines = [
      company.name,
      company.address,
      company.siret ? `SIRET : ${company.siret}` : null,
      `Email : ${company.email}`,
      company.phone ? `Tél. : ${company.phone}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const clientLines = [
      order.customerName || "Client",
      order.shippingAddress || "",
      `Email : ${order.customerEmail}`,
    ]
      .filter(Boolean)
      .join("\n");

    const y1 = drawMultiline(page, fonts.body, sellerLines, MARGIN, y, colW, 8);
    const y2 = drawMultiline(
      page,
      fonts.body,
      clientLines,
      MARGIN + colW + 16,
      y,
      colW,
      8
    );
    y = Math.min(y1, y2) - 14;
  }

  // Table
  const tableTop = y;
  const rowH = 18;
  const headers =
    type === "PREP_SLIP"
      ? (["N°", "DÉSIGNATION", "DOSAGE", "QTÉ", "EMPLACEMENT"] as const)
      : (["N°", "DÉSIGNATION", "DOSAGE", "QTÉ", "PRIX UNIT.", "TOTAL"] as const);
  const widths =
    type === "PREP_SLIP"
      ? [28, 250, 70, 40, 105]
      : [28, 200, 70, 36, 70, 70];

  page.drawRectangle({
    x: MARGIN,
    y: tableTop - rowH,
    width: PAGE_W - MARGIN * 2,
    height: rowH,
    color: c(DOC_BLACK),
  });
  let x = MARGIN + 4;
  headers.forEach((h, i) => {
    page.drawText(h, {
      x,
      y: tableTop - 13,
      size: 7,
      font: fonts.bold,
      color: c(DOC_GOLD),
    });
    x += widths[i];
  });

  y = tableTop - rowH;
  order.items.forEach((item, idx) => {
    y -= rowH;
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y,
        width: PAGE_W - MARGIN * 2,
        height: rowH,
        color: c(DOC_ROW),
      });
    }
    const cells =
      type === "PREP_SLIP"
        ? [
            String(idx + 1),
            truncate(designationOf(item), 42),
            dosageOf(item),
            String(item.quantity),
            "—",
          ]
        : [
            String(idx + 1),
            truncate(designationOf(item), 34),
            dosageOf(item),
            String(item.quantity),
            euros(item.priceCents),
            euros(item.priceCents * item.quantity),
          ];
    let cx = MARGIN + 4;
    cells.forEach((cell, i) => {
      page.drawText(cell.slice(0, 48), {
        x: cx,
        y: y + 5,
        size: 8,
        font: fonts.body,
        color: c(DOC_INK),
      });
      cx += widths[i];
    });
  });

  y -= 20;

  if (type === "ORDER_FORM") {
    const subtotal = order.totalCents - order.shippingCents + order.discountCents;
    page.drawText("MODE DE PAIEMENT", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    page.drawText(paymentMethodLabel(order.paymentProvider), {
      x: MARGIN,
      y: y - 12,
      size: 9,
      font: fonts.body,
      color: c(DOC_INK),
    });
    page.drawText("MODE DE LIVRAISON", {
      x: MARGIN,
      y: y - 30,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    y = drawWrapped(
      page,
      fonts.body,
      `${deliveryMethodLabel(order.deliveryMethod)}${order.shippingAddress ? ` — ${order.shippingAddress}` : ""}`,
      MARGIN,
      y - 42,
      280,
      9,
      c(DOC_INK)
    );

    const totalsX = PAGE_W - MARGIN - 160;
    let ty = tableTop - rowH - 28 - order.items.length * rowH;
    ty = Math.min(ty, y + 40);
    page.drawText(`Sous-total : ${euros(subtotal)}`, {
      x: totalsX,
      y: ty,
      size: 9,
      font: fonts.body,
      color: c(DOC_INK),
    });
    if (order.discountCents > 0) {
      ty -= 12;
      page.drawText(`Remise : -${euros(order.discountCents)}`, {
        x: totalsX,
        y: ty,
        size: 9,
        font: fonts.body,
        color: c(DOC_INK),
      });
    }
    ty -= 12;
    page.drawText(`Frais de livraison : ${euros(order.shippingCents)}`, {
      x: totalsX,
      y: ty,
      size: 9,
      font: fonts.body,
      color: c(DOC_INK),
    });
    ty -= 20;
    page.drawRectangle({
      x: totalsX - 6,
      y: ty - 4,
      width: 160,
      height: 18,
      color: c(DOC_BLACK),
    });
    page.drawText(`TOTAL TTC : ${euros(order.totalCents)}`, {
      x: totalsX,
      y: ty,
      size: 10,
      font: fonts.bold,
      color: c(DOC_GOLD),
    });

    y = Math.min(y, ty) - 28;
    page.drawText("INFORMATIONS IMPORTANTES", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    y = drawWrapped(
      page,
      fonts.body,
      "Le règlement de la commande vaut acceptation et fait foi de signature. Pour toute question : contact@allvaps.fr",
      MARGIN,
      y - 12,
      PAGE_W - MARGIN * 2,
      8,
      c(DOC_INK)
    );
    drawFooter(page, fonts, "MERCI POUR VOTRE CONFIANCE !");
  } else if (type === "INVOICE") {
    const subtotal = order.totalCents - order.shippingCents + order.discountCents;
    const totalsX = PAGE_W - MARGIN - 160;
    let ty = y;
    page.drawText(`Sous-total : ${euros(subtotal)}`, {
      x: totalsX,
      y: ty,
      size: 9,
      font: fonts.body,
      color: c(DOC_INK),
    });
    if (order.discountCents > 0) {
      ty -= 12;
      page.drawText(`Remise : -${euros(order.discountCents)}`, {
        x: totalsX,
        y: ty,
        size: 9,
        font: fonts.body,
        color: c(DOC_INK),
      });
    }
    ty -= 12;
    page.drawText(`Frais de livraison : ${euros(order.shippingCents)}`, {
      x: totalsX,
      y: ty,
      size: 9,
      font: fonts.body,
      color: c(DOC_INK),
    });
    ty -= 20;
    page.drawRectangle({
      x: totalsX - 6,
      y: ty - 4,
      width: 160,
      height: 18,
      color: c(DOC_BLACK),
    });
    page.drawText(`TOTAL TTC : ${euros(order.totalCents)}`, {
      x: totalsX,
      y: ty,
      size: 10,
      font: fonts.bold,
      color: c(DOC_GOLD),
    });
    y = ty - 36;
    page.drawText("MENTIONS LÉGALES", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    y = drawWrapped(
      page,
      fonts.body,
      "Facture à conserver. Paiement reçu à la commande. Réclamations : contact@allvaps.fr",
      MARGIN,
      y - 12,
      PAGE_W - MARGIN * 2,
      8,
      c(DOC_INK)
    );
    drawFooter(page, fonts, "MERCI POUR VOTRE CONFIANCE !");
  } else if (type === "PREP_SLIP") {
    page.drawText("INSTRUCTIONS", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    y -= 14;
    const instructions = [
      "Vérifier les produits et dosages",
      "Contrôler les quantités",
      "Emballer solidement",
      "Joindre le bon de commande",
      "Remettre au transporteur / point retrait",
    ];
    for (const line of instructions) {
      page.drawText(`• ${line}`, {
        x: MARGIN,
        y,
        size: 8,
        font: fonts.body,
        color: c(DOC_INK),
      });
      y -= 12;
    }
    y -= 8;
    page.drawText("ÉTAPES DE PRÉPARATION", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    y -= 16;
    const steps = ["À préparer", "Préparé", "Vérifié", "Emballé", "Expédié"];
    steps.forEach((s, i) => drawCheckbox(page, fonts, s, MARGIN + i * 100, y));
    y -= 28;
    page.drawText(`Statut actuel : ${orderStatusLabel(order.status as never)}`, {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.body,
      color: c(DOC_INK),
    });
    y -= 22;
    page.drawText("PRÉPARATEUR", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    page.drawText("Nom : ____________________    Date : ____ / ____ / ______", {
      x: MARGIN,
      y: y - 14,
      size: 9,
      font: fonts.body,
      color: c(DOC_INK),
    });
    y -= 40;
    page.drawText("NOTES / OBSERVATIONS", {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.bold,
      color: c(DOC_MUTED),
    });
    for (let i = 0; i < 3; i++) {
      page.drawLine({
        start: { x: MARGIN, y: y - 16 - i * 16 },
        end: { x: PAGE_W - MARGIN, y: y - 16 - i * 16 },
        thickness: 0.5,
        color: c(DOC_MUTED),
      });
    }
    drawFooter(page, fonts, "QUALITÉ — SÉCURITÉ — CONFIANCE");
  } else {
    drawFooter(page, fonts, "ALL VAP'S");
  }

  return pdf.save();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function drawMultiline(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number
): number {
  let cy = y;
  for (const raw of text.split("\n")) {
    cy = drawWrapped(page, font, raw, x, cy, maxWidth, size, c(DOC_INK), 2);
  }
  return cy;
}
