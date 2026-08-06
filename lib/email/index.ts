import { getEmailConfig } from "./config";
import { sendEmail } from "./service";
import { stores } from "@/lib/stores";
import * as templates from "./templates";
import type { OrderEmailItem } from "./types";

export async function sendAccountCreatedEmail(params: {
  to: string;
  firstName?: string | null;
  customerId?: string;
}) {
  const t = templates.accountCreatedTemplate({
    firstName: params.firstName,
    email: params.to,
  });
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "account_created",
    relatedCustomerId: params.customerId,
    idempotencyKey: params.customerId
      ? `account-created:${params.customerId}`
      : undefined,
  });
}

export async function sendEmailVerification(params: {
  to: string;
  confirmUrl: string;
  firstName?: string | null;
  customerId?: string;
}) {
  const t = templates.emailVerificationTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "email_verification",
    relatedCustomerId: params.customerId,
  });
}

/** Alias historique */
export async function sendAccountConfirmationEmail(params: {
  to: string;
  confirmUrl: string;
  firstName?: string | null;
  customerId?: string;
}) {
  return sendEmailVerification(params);
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}) {
  const t = templates.passwordResetTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "password_reset",
  });
}

export async function sendPasswordChangedEmail(params: {
  to: string;
  firstName?: string | null;
  customerId?: string;
}) {
  const t = templates.passwordChangedTemplate(params);
  const stamp = Math.floor(Date.now() / 60_000);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "password_changed",
    relatedCustomerId: params.customerId,
    idempotencyKey: params.customerId
      ? `password-changed:${params.customerId}:${stamp}`
      : undefined,
  });
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  totalCents: number;
  items: OrderEmailItem[];
  discountCents?: number;
  shippingCents?: number;
  shippingAddress?: string | null;
  deliveryMethod?: string | null;
  pickupStoreLabel?: string | null;
  customerId?: string;
}) {
  return sendPaymentConfirmationEmail(params);
}

export async function sendPaymentConfirmationEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  totalCents: number;
  items: OrderEmailItem[];
  discountCents?: number;
  shippingCents?: number;
  shippingAddress?: string | null;
  deliveryMethod?: string | null;
  pickupStoreLabel?: string | null;
  customerId?: string;
}) {
  const t = templates.paymentConfirmationTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "payment_confirmation",
    relatedOrderId: params.orderId,
    relatedCustomerId: params.customerId,
    idempotencyKey: `payment-confirmation:${params.orderId}`,
  });
}

export async function sendOrderShippedEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
  deliveryMethod?: string | null;
  carrierLabel?: string | null;
}) {
  const carrier =
    params.carrierLabel ||
    (params.deliveryMethod === "MONDIAL_RELAY"
      ? "Mondial Relay"
      : params.deliveryMethod === "RELAIS_COLIS"
        ? "Relais Colis"
        : params.deliveryMethod === "COLISSIMO"
          ? "Colissimo"
          : null);
  const t = templates.orderShippedTemplate({
    ...params,
    carrierLabel: carrier,
  });
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "order_shipped",
    relatedOrderId: params.orderId,
    idempotencyKey: `order-shipped:${params.orderId}:${params.trackingNumber}`,
  });
}

export async function sendOrderDeliveredEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
}) {
  const t = templates.orderDeliveredTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "order_delivered",
    relatedOrderId: params.orderId,
    idempotencyKey: `order-delivered:${params.orderId}`,
  });
}

export async function sendOrderStatusUpdateEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  statusLabel: string;
  previousLabel?: string;
}) {
  const t = templates.orderStatusUpdateTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "order_status_update",
    relatedOrderId: params.orderId,
    idempotencyKey: `order-status:${params.orderId}:${params.statusLabel}`,
  });
}

export async function sendOrderReadyForPickupEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  pickupStoreId?: string | null;
}) {
  const store =
    stores.find((s) => s.id === params.pickupStoreId) || stores[0];
  const t = templates.orderReadyPickupTemplate({
    orderId: params.orderId,
    customerName: params.customerName,
    storeName: store.name,
    storeAddress: `${store.address}, ${store.postalCode} ${store.city}`,
  });
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "order_ready_pickup",
    relatedOrderId: params.orderId,
    idempotencyKey: `order-ready-pickup:${params.orderId}`,
  });
}

export async function sendOrderCancelledEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
}) {
  const t = templates.orderCancelledTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "order_cancelled",
    relatedOrderId: params.orderId,
    idempotencyKey: `order-cancelled:${params.orderId}`,
  });
}

export async function sendOrderRefundedEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  totalCents?: number;
}) {
  const t = templates.orderRefundedTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "order_refunded",
    relatedOrderId: params.orderId,
    idempotencyKey: `order-refunded:${params.orderId}`,
  });
}

export async function sendAdminNewOrderEmail(params: {
  orderId: string;
  customerEmail: string;
  totalCents: number;
}) {
  const cfg = getEmailConfig();
  const to = cfg.adminNotificationEmail;
  if (!to) return { transport: "disabled" as const };

  const t = templates.adminNewOrderTemplate(params);
  return sendEmail({
    to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "admin_new_order",
    relatedOrderId: params.orderId,
    idempotencyKey: `admin-new-order:${params.orderId}`,
  });
}

export async function sendAdminNewRegistrationEmail(params: {
  email: string;
  firstName?: string | null;
  customerId: string;
}) {
  const cfg = getEmailConfig();
  const to = cfg.adminNotificationEmail;
  if (!to) return { transport: "disabled" as const };

  const t = templates.adminNewRegistrationTemplate(params);
  return sendEmail({
    to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "admin_new_registration",
    relatedCustomerId: params.customerId,
    idempotencyKey: `admin-new-registration:${params.customerId}`,
  });
}

export async function sendContactConfirmationEmail(params: {
  to: string;
  firstName?: string | null;
  requestId: string;
}) {
  const t = templates.contactConfirmationTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "contact_confirmation",
    idempotencyKey: `contact-confirmation:${params.requestId}`,
  });
}

export async function sendContactAdminEmail(params: {
  requestId: string;
  fromEmail: string;
  fromName?: string | null;
  message: string;
}) {
  const cfg = getEmailConfig();
  const to = cfg.adminNotificationEmail || cfg.fromAddress;
  const t = templates.contactAdminTemplate(params);
  return sendEmail({
    to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "contact_admin",
    idempotencyKey: `contact-admin:${params.requestId}`,
  });
}

export async function sendAdminTestEmail(params: { to: string }) {
  const t = templates.adminTestTemplate();
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "admin_test",
  });
}

export async function sendLoyaltyLinkedEmail(params: {
  to: string;
  firstName?: string | null;
  customerId?: string;
}) {
  if (!getEmailConfig().loyaltyEmailsEnabled) {
    return { transport: "disabled" as const };
  }
  const t = templates.loyaltyLinkedTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "loyalty_linked",
    relatedCustomerId: params.customerId,
    idempotencyKey: params.customerId
      ? `loyalty-linked:${params.customerId}`
      : undefined,
  });
}

export async function sendLoyaltyPointsAddedEmail(params: {
  to: string;
  firstName?: string | null;
  points: number;
  customerId?: string;
  eventId?: string;
}) {
  if (!getEmailConfig().loyaltyEmailsEnabled) {
    return { transport: "disabled" as const };
  }
  const t = templates.loyaltyPointsAddedTemplate(params);
  return sendEmail({
    to: params.to,
    subject: t.subject,
    html: t.html,
    text: t.text,
    type: "loyalty_points_added",
    relatedCustomerId: params.customerId,
    idempotencyKey: params.eventId
      ? `loyalty-points:${params.eventId}`
      : undefined,
  });
}
