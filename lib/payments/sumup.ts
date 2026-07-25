import { createHmac, timingSafeEqual } from "crypto";

const SUMUP_API_URL = "https://api.sumup.com";

export interface SumUpCheckoutResponse {
  id: string;
  checkout_reference: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  merchant_code: string;
  description?: string;
  transactions?: Array<{ id?: string; transaction_id?: string }>;
}

function getSumUpConfig() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;
  if (!apiKey || !merchantCode) throw new Error("SUMUP_NOT_CONFIGURED");
  return { apiKey, merchantCode };
}

async function sumupFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { apiKey } = getSumUpConfig();
  const response = await fetch(`${SUMUP_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`SumUp API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function isSumUpConfigured(): boolean {
  return !!(process.env.SUMUP_API_KEY && process.env.SUMUP_MERCHANT_CODE);
}

export async function createSumUpCheckout(params: {
  checkoutReference: string;
  amountCents: number;
  description: string;
  returnUrl: string;
}): Promise<SumUpCheckoutResponse> {
  const { merchantCode } = getSumUpConfig();
  return sumupFetch<SumUpCheckoutResponse>("/v0.1/checkouts", {
    method: "POST",
    body: JSON.stringify({
      checkout_reference: params.checkoutReference,
      amount: params.amountCents / 100,
      currency: "EUR",
      merchant_code: merchantCode,
      description: params.description,
      return_url: params.returnUrl,
    }),
  });
}

export async function verifySumUpPayment(checkoutId: string): Promise<boolean> {
  const checkout = await sumupFetch<SumUpCheckoutResponse>(`/v0.1/checkouts/${checkoutId}`);
  return checkout.status === "PAID";
}

export async function refundSumUpCheckout(checkoutId: string, amountCents: number): Promise<void> {
  const checkout = await sumupFetch<SumUpCheckoutResponse>(`/v0.1/checkouts/${checkoutId}`);

  const txn = checkout.transactions?.[0]?.id || checkout.transactions?.[0]?.transaction_id;
  if (!txn) throw new Error("SUMUP_REFUND_TXN_MISSING");

  await sumupFetch(`/v0.1/me/refund/${txn}`, {
    method: "POST",
    body: JSON.stringify({
      amount: amountCents / 100,
      currency: "EUR",
    }),
  });
}

/** Vérifie x-payload-signature HMAC-SHA256 si SUMUP_WEBHOOK_SECRET est défini. */
export function verifySumUpWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SUMUP_WEBHOOK_SECRET;
  if (!secret) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const isLocal = /localhost|127\.0\.0\.1/i.test(appUrl);
    if (process.env.NODE_ENV === "production" && !isLocal) return false;
    return true;
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.replace(/^sha256=/i, "").trim();

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(received, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return expected === received;
  }
}
