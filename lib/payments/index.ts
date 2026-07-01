export type PaymentProviderId = "viva" | "sumup";

export interface CheckoutSessionRequest {
  orderId: string;
  provider: PaymentProviderId;
  returnUrl: string;
}

export interface CheckoutSessionResult {
  provider: PaymentProviderId;
  checkoutId: string;
  redirectUrl?: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  name: string;
  isConfigured(): boolean;
  createCheckout(params: {
    orderId: string;
    amountCents: number;
    description: string;
    returnUrl: string;
    customerEmail: string;
  }): Promise<CheckoutSessionResult>;
  verifyPayment(checkoutId: string): Promise<boolean>;
}

export { createSumUpCheckout, verifySumUpPayment } from "@/lib/payments/sumup";
export { createVivaCheckout, verifyVivaPayment } from "@/lib/payments/viva";
