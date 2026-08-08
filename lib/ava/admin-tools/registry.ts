import type { AvaAdminToolDef, AvaAdminToolName } from "./types";
import {
  execAvaStatus,
  execCatalogAudit,
  execDailySummary,
  execFidelatooStatus,
  execFullReport,
  execInventoryReport,
  execListCapabilities,
  execOrdersReport,
  execStockReport,
} from "./executors";

/**
 * Registre central des capacités Admin A.V.A.
 * Ne jamais importer depuis une surface CLIENT.
 */
export const AVA_ADMIN_TOOLS: Record<AvaAdminToolName, AvaAdminToolDef> = {
  getDailySummary: {
    name: "getDailySummary",
    description: "Résumé opérationnel du jour (commandes, préparation, alertes)",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 12_000,
    resultType: "report",
    execute: execDailySummary,
  },
  getStockReport: {
    name: "getStockReport",
    description: "État des stocks (faibles, ruptures, négatifs)",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 12_000,
    resultType: "report",
    execute: (ctx) => execStockReport(ctx, false),
  },
  getLowStockReport: {
    name: "getLowStockReport",
    description: "Stocks faibles / urgents, filtrable par boutique",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 12_000,
    resultType: "report",
    execute: (ctx) => execStockReport(ctx, true),
  },
  getInventoryReport: {
    name: "getInventoryReport",
    description: "Sessions d'inventaire physiques (ouvertes / terminées)",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 10_000,
    resultType: "report",
    execute: execInventoryReport,
  },
  getOrdersReport: {
    name: "getOrdersReport",
    description: "Commandes, paiements en attente, file de préparation",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 12_000,
    resultType: "report",
    execute: execOrdersReport,
  },
  getCatalogAudit: {
    name: "getCatalogAudit",
    description: "Audit classification catalogue, gammes, fabricants",
    requiredRole: "ADMIN",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 15_000,
    resultType: "report",
    execute: execCatalogAudit,
  },
  getAvaStatus: {
    name: "getAvaStatus",
    description: "Statut agent A.V.A. et session admin",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "low",
    timeoutMs: 8_000,
    resultType: "status",
    execute: execAvaStatus,
  },
  getFidelatooStatus: {
    name: "getFidelatooStatus",
    description: "Statut Fidelatoo / VM Android",
    requiredRole: "ADMIN",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "medium",
    timeoutMs: 8_000,
    resultType: "status",
    execute: execFidelatooStatus,
  },
  getFullReport: {
    name: "getFullReport",
    description: "Agrège résumé, stocks, inventaires, commandes, catalogue, systèmes",
    requiredRole: "ADMIN",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "high",
    timeoutMs: 45_000,
    resultType: "report",
    execute: execFullReport,
  },
  listCapabilities: {
    name: "listCapabilities",
    description: "Liste ce que A.V.A. Admin peut faire",
    requiredRole: "EMPLOYEE",
    requiredPermissions: ["avaAdmin"],
    sensitivity: "low",
    timeoutMs: 1_000,
    resultType: "meta",
    execute: execListCapabilities,
  },
};

export function getAdminTool(name: AvaAdminToolName): AvaAdminToolDef | null {
  return AVA_ADMIN_TOOLS[name] || null;
}

export function listAdminToolNames(): AvaAdminToolName[] {
  return Object.keys(AVA_ADMIN_TOOLS) as AvaAdminToolName[];
}
