const VIVA_API_URL = process.env.VIVA_API_URL || "https://demo-api.vivapayments.com";

export interface VivaCheckoutResponse {
  orderCode: number;
  redirectUrl?: string;
}

function getVivaConfig() {
  const clientId = process.env.VIVA_CLIENT_ID;
  const clientSecret = process.env.VIVA_CLIENT_SECRET;
  const merchantId = process.env.VIVA_MERCHANT_ID;
  const sourceCode = process.env.VIVA_SOURCE_CODE || "Default";

  if (!clientId || !clientSecret || !merchantId) {
    throw new Error("VIVA_NOT_CONFIGURED");
  }

  return { clientId, clientSecret, merchantId, sourceCode };
}

export function isVivaConfigured(): boolean {
  return !!(
    process.env.VIVA_CLIENT_ID &&
    process.env.VIVA_CLIENT_SECRET &&
    process.env.VIVA_MERCHANT_ID
  );
}

export async function createVivaCheckout(params: {
  orderId: string;
  amountCents: number;
  customerEmail: string;
  description: string;
  returnUrl: string;
}): Promise<VivaCheckoutResponse> {
  const { merchantId, sourceCode } = getVivaConfig();

  const response = await fetch(`${VIVA_API_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: params.amountCents,
      customerTrns: params.description,
      customer: { email: params.customerEmail, fullName: params.customerEmail },
      paymentTimeout: 300,
      preauth: false,
      allowRecurring: false,
      maxInstallments: 0,
      paymentNotification: true,
      tipAmount: 0,
      disableExactAmount: false,
      disableCash: true,
      disableWallet: false,
      sourceCode,
      merchantTrns: params.orderId,
      tags: ["all-vaps"],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Viva API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as { OrderCode?: number; orderCode?: number };
  const orderCode = data.OrderCode ?? data.orderCode;

  if (!orderCode) throw new Error("VIVA_ORDER_CODE_MISSING");

  const redirectUrl = `https://www.vivapayments.com/web/checkout?ref=${merchantId}&ordercode=${orderCode}&color=059669`;

  return { orderCode, redirectUrl };
}

export async function verifyVivaPayment(orderCode: string): Promise<boolean> {
  if (!isVivaConfigured()) return false;

  try {
    const response = await fetch(
      `${VIVA_API_URL}/api/transactions/?ordercode=${orderCode}`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { Transactions?: Array<{ StatusId?: string }> };
    return data.Transactions?.some((t) => t.StatusId === "F") ?? false;
  } catch {
    return false;
  }
}
