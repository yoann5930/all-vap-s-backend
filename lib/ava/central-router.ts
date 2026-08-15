import type { AvaChannel } from "@/lib/ava/ava-core";
import { AVA_SYSTEM_ID } from "@/lib/ava/ava-core";

export const AVA_PUBLIC_ACTIONS = ["conversation", "end_session"] as const;
export type AvaPublicAction = (typeof AVA_PUBLIC_ACTIONS)[number];

/** Jamais exposées par le routeur AVA — même si le client les envoie. */
export const AVA_FORBIDDEN_ACTIONS = [
  "write_inventory",
  "apply_stock",
  "apply-stock",
  "modify_stock",
  "patch_stock",
  "delete_stock",
  "create_movement",
  "refund",
  "applyStoreSale",
  "modify_product",
  "delete_product",
  "catalog_write",
] as const;

export type AvaAuthSnapshot = {
  authenticated: boolean;
  role: string | null;
};

/**
 * Le client peut envoyer clientSource, mais ça ne donne AUCUN droit.
 * Seule une session serveur ADMIN authentifiée ouvre le canal admin.
 */
export function resolveAvaChannel(auth: AvaAuthSnapshot | null | undefined): AvaChannel {
  const role = (auth?.role || "").toUpperCase();
  if (auth?.authenticated && role === "ADMIN") return "ADMIN_WEB";
  return "ANDROID";
}

export function isForbiddenAvaAction(action: string): boolean {
  const n = action.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return AVA_FORBIDDEN_ACTIONS.some((item) => item.toLowerCase().replace(/[\s-]+/g, "_") === n);
}

export function parseAvaPublicAction(raw: unknown): AvaPublicAction | "forbidden" | "invalid" {
  if (raw == null || raw === "") return "conversation";
  if (typeof raw !== "string") return "invalid";
  if (isForbiddenAvaAction(raw)) return "forbidden";
  const n = raw.trim().toLowerCase();
  if (n === "conversation" || n === "end_session") return n;
  if (n === "catalog" || n === "web_search" || n === "web-search") {
    return "conversation";
  }
  return "invalid";
}

export function avaEndpointManifest() {
  return {
    ok: true,
    avaSystemId: AVA_SYSTEM_ID,
    actions: [...AVA_PUBLIC_ACTIONS],
    stock: "read-only",
    tools: ["catalog_internal", "web_internal", "memory_shared", "llm"],
  };
}
