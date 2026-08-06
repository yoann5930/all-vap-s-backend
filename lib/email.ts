/**
 * Point d'entrée historique `@/lib/email`.
 * Toute la logique vit dans `lib/email/` — ne pas recréer un second système.
 */
export type { EmailPayload, EmailType, OrderEmailItem, SendEmailResult } from "./email/types";
export { EmailError } from "./email/errors";
export {
  getEmailConfig,
  formatFromHeader,
  logEmailStartupStatus,
} from "./email/config";
export { verifyEmailTransport } from "./email/transport";
export { sendEmail, assertSafeEmailAddress } from "./email/service";
export { isEmailConfigured } from "./email/compat";
export { maskEmail, maskPhone } from "./email/mask";
export {
  sendAccountCreatedEmail,
  sendEmailVerification,
  sendAccountConfirmationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendOrderConfirmationEmail,
  sendPaymentConfirmationEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderStatusUpdateEmail,
  sendOrderReadyForPickupEmail,
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
  sendAdminNewOrderEmail,
  sendAdminNewRegistrationEmail,
  sendContactConfirmationEmail,
  sendContactAdminEmail,
  sendAdminTestEmail,
  sendLoyaltyLinkedEmail,
  sendLoyaltyPointsAddedEmail,
} from "./email/index";
