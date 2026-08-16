/** Destinataire officiel du bon de préparation — ne pas changer sans validation. */
export const PREPARER_NOTIFICATION_EMAIL = "allvaps70@gmail.com";

export type AvaOrderAuditEvent =
  | "ORDER_PAID"
  | "LOYALTY_APPLIED"
  | "ORDER_DOCUMENT_SENT"
  | "PREPARATION_DOCUMENT_SENT"
  | "PREPARING_STARTED"
  | "ORDER_READY"
  | "SHIPMENT_CREATED"
  | "LABEL_GENERATED"
  | "PREPARER_NOTIFIED"
  | "CUSTOMER_NOTIFIED"
  | "READY_FOR_PICKUP"
  | "SHIPPED";

export function orderDocumentFileName(
  type: "ORDER_FORM" | "PREP_SLIP" | "DELIVERY_SLIP" | "INVOICE" | string,
  orderId: string,
): string {
  switch (type) {
    case "ORDER_FORM":
      return `ORDER_${orderId}.pdf`;
    case "PREP_SLIP":
      return `PREPARATION_${orderId}.pdf`;
    case "DELIVERY_SLIP":
      return `SHIPPING_${orderId}.pdf`;
    case "INVOICE":
      return `INVOICE_${orderId}.pdf`;
    default:
      return `DOC_${orderId}.pdf`;
  }
}

export function shippingArtifactFileName(
  kind: "label" | "qr",
  carrier: string,
  orderId: string,
  ext: string,
): string {
  const c = (carrier || "carrier").replace(/[^a-z0-9-]+/gi, "-");
  const prefix = kind === "qr" ? "QR" : "SHIPPING";
  return `${prefix}_${c}_${orderId}.${ext.replace(/^\./, "")}`;
}

export function shortOrderRef(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}
