/**
 * Charge .env / .env.local comme Next.js en mode développement.
 * Évite de charger .env.production.local (souvent des credentials prod/incorrects en CLI).
 */
import { loadEnvConfig } from "@next/env";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}

loadEnvConfig(process.cwd(), true);
