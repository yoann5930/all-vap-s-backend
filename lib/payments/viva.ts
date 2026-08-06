const VIVA_API_URL =
  process.env.VIVA_API_URL ||
  (process.env.NODE_ENV === "production" &&
  !/localhost|127\.0\.0\.1/i.test(process.env.NEXT_PUBLIC_APP_URL || "")
    ? "https://api.vivapayments.com"
    : "https://demo-api.vivapayments.com");

export interface VivaCheckoutResponse {
  orderCode: number;
  redirectUrl?: string;
}

function isVivaDemo(): boolean {
  return VIVA_API_URL.includes("demo");
}

function getVivaAccountsUrl(): string {
  return isVivaDemo()
    ? "https://demo-accounts.vivapayments.com"
    : "https://accounts.vivapayments.com";
}

function getVivaCheckoutPageUrl(orderCode: number): string {
  const host = isVivaDemo() ? "https://demo.vivapayments.com" : "https://www.vivapayments.com";
  return `${host}/web/checkout?ref=${orderCode}`;
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

/** OAuth2 client_credentials → Bearer token for Smart Checkout APIs */
async function getVivaAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getVivaConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${getVivaAccountsUrl()}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Viva OAuth error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("VIVA_ACCESS_TOKEN_MISSING");
  return data.access_token;
}

export async function createVivaCheckout(params: {
  orderId: string;
  amountCents: number;
  customerEmail: string;
  description: string;
  returnUrl: string;
}): Promise<VivaCheckoutResponse> {
  const { sourceCode } = getVivaConfig();
  const accessToken = await getVivaAccessToken();

  const response = await fetch(`${VIVA_API_URL}/checkout/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountCents,
      customerTrns: params.description,
      customer: {
        email: params.customerEmail,
        fullName: params.customerEmail,
        requestLang: "fr-FR",
        countryCode: "FR",
      },
      paymentTimeout: 1800,
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
      tags: ["all-vaps", `return:${params.returnUrl}`],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Viva API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as { OrderCode?: number; orderCode?: number };
  const orderCode = data.OrderCode ?? data.orderCode;

  if (!orderCode) throw new Error("VIVA_ORDER_CODE_MISSING");

  // Smart Checkout : URL hébergée + retour configuré aussi sur la source de paiement Viva
  const redirectUrl = `${getVivaCheckoutPageUrl(orderCode)}&color=059669`;

  return { orderCode, redirectUrl };
}

export async function verifyVivaPayment(orderCode: string): Promise<boolean> {
  if (!isVivaConfigured()) return false;

  try {
    const accessToken = await getVivaAccessToken();
    const response = await fetch(
      `${VIVA_API_URL}/checkout/v2/transactions?ordercode=${encodeURIComponent(orderCode)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );
    if (!response.ok) return false;
    const data = (await response.json()) as {
      Transactions?: Array<{ StatusId?: string; statusId?: string; TransactionId?: string }>;
      transactions?: Array<{ StatusId?: string; statusId?: string; transactionId?: string }>;
    };
    const list = data.Transactions ?? data.transactions ?? [];
    return list.some((t) => (t.StatusId ?? t.statusId) === "F");
  } catch {
    return false;
  }
}

export async function refundVivaOrder(orderCode: string, amountCents: number): Promise<void> {
  const accessToken = await getVivaAccessToken();
  const response = await fetch(
    `${VIVA_API_URL}/checkout/v2/transactions?ordercode=${encodeURIComponent(orderCode)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );
  if (!response.ok) throw new Error(`Viva API error: ${response.status}`);

  const data = (await response.json()) as {
    Transactions?: Array<{ StatusId?: string; TransactionId?: string; transactionId?: string }>;
    transactions?: Array<{ StatusId?: string; TransactionId?: string; transactionId?: string }>;
  };
  const list = data.Transactions ?? data.transactions ?? [];
  const paid = list.find((t) => (t.StatusId ?? "") === "F" || t.TransactionId || t.transactionId);
  const txnId = paid?.TransactionId || paid?.transactionId;
  if (!txnId) throw new Error("VIVA_REFUND_TXN_MISSING");

  const refundRes = await fetch(`${VIVA_API_URL}/checkout/v2/transactions/${txnId}:refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: amountCents, sourceCode: getVivaConfig().sourceCode }),
  });

  if (!refundRes.ok) {
    const err = await refundRes.text();
    throw new Error(`Viva refund error: ${refundRes.status} - ${err}`);
  }
}
