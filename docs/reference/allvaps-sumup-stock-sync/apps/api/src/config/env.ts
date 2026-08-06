import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  SUMUP_API_KEY: z.string().optional(),
  SUMUP_MERCHANT_CODE: z.string().optional(),
  SUMUP_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  SUMUP_HISTORY_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  SUMUP_SYNC_START_AT: z.string().datetime().default('2026-01-01T00:00:00.000Z'),
  SUMUP_CATALOG_MODE: z.enum(['csv']).default('csv'),
  SUMUP_STOCK_WRITE_MODE: z.enum(['disabled', 'official-partner-api']).default('disabled'),
  WEBHOOK_SHARED_SECRET: z.string().min(8),
  VIVA_WEBHOOK_SECRET: z.string().optional(),
  ALLOW_NEGATIVE_STOCK: z.coerce.boolean().default(false),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15)
});

export const env = schema.parse(process.env);
