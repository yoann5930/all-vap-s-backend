/** Mode démo : données locales sans PostgreSQL (opt-in explicite via DEMO_MODE=true).
 *  Note: une variable d'environnement système DEMO_MODE écrase le fichier .env (comportement Next.js).
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export { getDemoStore, resetDemoStore } from "./store";
export { createDemoPrismaClient } from "./client";
