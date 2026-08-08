import type { GestionLink } from "@/lib/ava-gestion/analytics";

export type AvaAdminToolName =
  | "getDailySummary"
  | "getStockReport"
  | "getLowStockReport"
  | "getInventoryReport"
  | "getOrdersReport"
  | "getCatalogAudit"
  | "getAvaStatus"
  | "getFidelatooStatus"
  | "getFullReport"
  | "listCapabilities"
  | "runDailyTour"
  | "runAnomalyScan"
  | "getBusinessReflections"
  | "getMarketRadar"
  | "proposeBusinessIdeas"
  | "simulateBusinessDecision";
export type AvaAdminToolSensitivity = "low" | "medium" | "high";

export type AvaAdminToolResult = {
  ok: boolean;
  tool: AvaAdminToolName;
  title: string;
  text: string;
  links?: GestionLink[];
  missingData?: string[];
  periodLabel?: string;
  error?: string;
  data?: Record<string, unknown>;
};

export type AvaAdminToolContext = {
  /** Rôle DB session (ADMIN / EMPLOYEE / …) — jamais depuis le message */
  role: string;
  /** Rôle applicatif (OWNER / ADMIN / …) */
  appRole: string;
  email: string;
  userId: string;
  /** Message utilisateur courant (pour simulations / propositions) */
  message?: string | null;
  /** Filtre boutique suivi (ex. Hautmont) */
  storeQuery?: string | null;
  /** Limite liste (ex. top 10) */
  limit?: number | null;
  periodKey?: string | null;
  history?: { role: "user" | "assistant"; content: string }[];
};

export type AvaAdminToolDef = {
  name: AvaAdminToolName;
  description: string;
  requiredRole: "EMPLOYEE" | "ADMIN";
  requiredPermissions: string[];
  sensitivity: AvaAdminToolSensitivity;
  timeoutMs: number;
  resultType: "report" | "status" | "list" | "meta";
  execute: (ctx: AvaAdminToolContext) => Promise<AvaAdminToolResult>;
};

export type AvaAdminToolPlan = {
  tools: AvaAdminToolName[];
  storeQuery: string | null;
  limit: number | null;
  periodKey: string | null;
  /** Demande vraiment floue → clarification, pas fallback générique */
  needsClarification: boolean;
  clarification?: string;
  /** Intent détecté pour logs non sensibles */
  intentLabel: string;
};
