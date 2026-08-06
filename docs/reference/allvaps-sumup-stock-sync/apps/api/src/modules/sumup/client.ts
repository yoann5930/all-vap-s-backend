import { env } from '../../config/env.js';

export interface SumUpTransaction {
  id: string;
  transaction_code: string;
  status: string;
  timestamp: string;
  amount: number;
  currency: string;
}

export interface SumUpReceiptProduct {
  name: string;
  description?: string;
  price?: string;
  quantity?: number;
}

export class SumUpClient {
  private readonly baseUrl = 'https://api.sumup.com';

  private headers(): Record<string, string> {
    if (!env.SUMUP_API_KEY) throw new Error('SUMUP_API_KEY absent');
    return { Authorization: `Bearer ${env.SUMUP_API_KEY}`, Accept: 'application/json' };
  }

  async listTransactions(): Promise<SumUpTransaction[]> {
    if (!env.SUMUP_MERCHANT_CODE) throw new Error('SUMUP_MERCHANT_CODE absent');
    const url = new URL(`/v2.1/merchants/${env.SUMUP_MERCHANT_CODE}/transactions/history`, this.baseUrl);
    url.searchParams.set('order', 'ascending');
    url.searchParams.set('limit', String(env.SUMUP_HISTORY_PAGE_SIZE));
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`SumUp history ${response.status}`);
    return (await response.json()) as SumUpTransaction[];
  }

  async getReceipt(transactionId: string): Promise<unknown> {
    if (!env.SUMUP_MERCHANT_CODE) throw new Error('SUMUP_MERCHANT_CODE absent');
    const url = new URL(`/v1.1/receipts/${encodeURIComponent(transactionId)}`, this.baseUrl);
    url.searchParams.set('mid', env.SUMUP_MERCHANT_CODE);
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`SumUp receipt ${response.status}`);
    return response.json();
  }
}
