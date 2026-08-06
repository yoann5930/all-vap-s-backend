/** Types du service e-mail A.V.A. / All Vap's */
export type EmailType =
  | "account_created"
  | "email_verification"
  | "password_reset"
  | "password_changed"
  | "order_received"
  | "payment_confirmation"
  | "order_preparing"
  | "order_ready_pickup"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "order_refunded"
  | "order_status_update"
  | "loyalty_linked"
  | "loyalty_points_added"
  | "contact_confirmation"
  | "contact_admin"
  | "admin_new_order"
  | "admin_new_registration"
  | "admin_payment_failed"
  | "admin_test"
  | "admin_notification"
  | "management_report"
  | "generic";

export type EmailAttachment = {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
};

export type EmailPayload = {
  to: string;
  /** Copies cachées (gérant / A.V.A.) — préféré au multi-envoi pour BC/facture */
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Clé d'idempotence métier (ex. payment-confirmation:ORDER_ID) */
  idempotencyKey?: string;
  type?: EmailType;
  relatedOrderId?: string;
  relatedCustomerId?: string;
  attachments?: EmailAttachment[];
  /** Préfixe audit explicite */
  auditCampaignId?: string | null;
  isAudit?: boolean;
};

export type SendEmailResult = {
  transport: "smtp" | "resend" | "console" | "disabled" | "skipped_duplicate";
  messageId?: string;
  redirectedToTest?: boolean;
};

export type OrderEmailItem = {
  name: string;
  quantity: number;
  priceCents: number;
  variantLabel?: string | null;
  isGift?: boolean;
};
