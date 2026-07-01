/** Mode démo : données locales sans PostgreSQL (désactiver avec DEMO_MODE=false) */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}

export { getDemoStore, resetDemoStore } from "./store";
export { createDemoPrismaClient } from "./client";
