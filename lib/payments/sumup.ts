const SUMUP_API_URL = "https://api.sumup.com";

interface SumUpCheckoutRequest {
  checkout_reference: string;
  amount: number;
  currency: string;
  merchant_code: string;
  description?: string;
  return_url: string;
}

export interface SumUpCheckoutResponse {
  id: string;
  checkout_reference: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  merchant_code: string;
  description?: string;
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
