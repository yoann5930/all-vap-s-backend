import { z } from "zod";
import { FIDELATOO_COMMANDS } from "./types";

export const fidelatooCommandSchema = z.enum(FIDELATOO_COMMANDS);

export const authorizeStoreSchema = z.object({
  store: z.enum(["HAUTMONT", "LE_QUESNOY"]),
  allow: z.boolean(),
});

export const emptyBodySchema = z.object({}).strict().optional();

export const auditQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).default(50),
});
