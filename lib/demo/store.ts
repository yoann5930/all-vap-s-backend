import { cloneDemoSeed, type DemoStore } from "./seed-data";

const globalForDemo = globalThis as unknown as { demoStore?: DemoStore };

export function getDemoStore(): DemoStore {
  if (!globalForDemo.demoStore) {
    globalForDemo.demoStore = cloneDemoSeed();
  }
  return globalForDemo.demoStore;
}

export function resetDemoStore(): DemoStore {
  globalForDemo.demoStore = cloneDemoSeed();
  return globalForDemo.demoStore;
}

export type ModelName =
  | "user"
  | "category"
  | "brand"
  | "product"
  | "order"
  | "orderItem"
  | "favorite"
  | "address"
  | "review"
  | "coupon"
  | "banner"
  | "passwordResetToken"
  | "vapeProfile"
  | "vapeRecommendation"
  | "stockLocation"
  | "productVariant"
  | "stockLevel"
  | "stockMovement"
  | "inventorySession"
  | "inventoryLine"
  | "inventoryPhoto"
  | "inventoryAuditLog"
  | "syncRun"
  | "productMatch"
  | "syncError"
  | "refreshToken"
  | "auditLog";

export function getModelArray(store: DemoStore, model: ModelName): Array<Record<string, unknown>> {
  const map: Record<ModelName, keyof DemoStore> = {
    user: "users",
    category: "categories",
    brand: "brands",
    product: "products",
    order: "orders",
    orderItem: "orderItems",
    favorite: "favorites",
    address: "addresses",
    review: "reviews",
    coupon: "coupons",
    banner: "banners",
    passwordResetToken: "passwordResetTokens",
    vapeProfile: "vapeProfiles",
    vapeRecommendation: "vapeRecommendations",
    stockLocation: "stockLocations",
    productVariant: "productVariants",
    stockLevel: "stockLevels",
    stockMovement: "stockMovements",
    inventorySession: "inventorySessions",
    inventoryLine: "inventoryLines",
    inventoryPhoto: "inventoryPhotos",
    inventoryAuditLog: "inventoryAuditLogs",
    syncRun: "syncRuns",
    productMatch: "productMatches",
    syncError: "syncErrors",
    refreshToken: "refreshTokens",
    auditLog: "auditLogs",
  };
  return store[map[model]] as Array<Record<string, unknown>>;
}

export function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function now(): Date {
  return new Date();
}
