import { roleAtLeast } from "@/lib/admin/roles";
import { AvaError, AvaErrorCode } from "@/lib/ava/errors";
import { getAdminTool } from "./registry";
import { selectAdminTools } from "./select-tools";
import { sanitizeAdminToolError } from "./sanitize-error";
import type {
  AvaAdminToolContext,
  AvaAdminToolName,
  AvaAdminToolPlan,
  AvaAdminToolResult,
} from "./types";

export type RunAdminToolsOutput = {
  plan: AvaAdminToolPlan;
  results: AvaAdminToolResult[];
  factsText: string;
  links: NonNullable<AvaAdminToolResult["links"]>;
  missingData: string[];
};

/**
 * Garde-fou : outils Admin uniquement si la SESSION a un rôle staff.
 * Jamais basé sur le texte du message.
 */
export function assertCanRunAdminTools(role: string): void {
  if (!roleAtLeast(role, "EMPLOYEE")) {
    throw new AvaError(
      AvaErrorCode.AVA_PERMISSION_DENIED,
      "Client cannot run admin tools",
      "Ces outils Admin ne sont pas disponibles sur cette session."
    );
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function runOne(
  name: AvaAdminToolName,
  ctx: AvaAdminToolContext
): Promise<AvaAdminToolResult> {
  const def = getAdminTool(name);
  if (!def) {
    return {
      ok: false,
      tool: name,
      title: name,
      text: `Outil ${name} inconnu.`,
      error: "unknown_tool",
    };
  }

  if (!roleAtLeast(ctx.role, def.requiredRole)) {
    return {
      ok: false,
      tool: name,
      title: def.description,
      text: `Outil réservé (rôle insuffisant pour ${def.name}).`,
      error: "role_denied",
    };
  }

  try {
    return await withTimeout(def.execute(ctx), def.timeoutMs, def.name);
  } catch (e) {
    const reason =
      e instanceof Error && e.message.startsWith("timeout:")
        ? "délai dépassé"
        : sanitizeAdminToolError(e);
    return {
      ok: false,
      tool: name,
      title: def.description,
      text: `${def.description} indisponible pour le moment (${reason}).`,
      error: reason,
      missingData: [name],
    };
  }
}

/**
 * Exécute le plan d'outils en isolant les pannes (une panne ≠ échec global).
 */
export async function runAdminToolPlan(
  message: string,
  ctx: AvaAdminToolContext
): Promise<RunAdminToolsOutput> {
  assertCanRunAdminTools(ctx.role);

  const plan = selectAdminTools(message, ctx.history || []);
  const enriched: AvaAdminToolContext = {
    ...ctx,
    message,
    storeQuery: plan.storeQuery || ctx.storeQuery,
    limit: plan.limit ?? ctx.limit,
    periodKey: plan.periodKey || ctx.periodKey,
  };

  let results: AvaAdminToolResult[] = [];
  if (plan.tools.length === 0) {
    results = [];
  } else if (plan.tools.length === 1) {
    results = [await runOne(plan.tools[0], enriched)];
  } else {
    results = await Promise.all(plan.tools.map((name) => runOne(name, enriched)));
  }

  const factsText = results
    .map((r) => {
      const flag = r.ok ? "OK" : "PARTIAL";
      return `[${flag}] ${r.title}\n${r.text}`;
    })
    .join("\n\n---\n\n");

  const links = results.flatMap((r) => r.links || []).slice(0, 25);
  const missingData = results.flatMap((r) => r.missingData || (r.ok ? [] : [r.tool]));

  return { plan, results, factsText, links, missingData };
}

export { selectAdminTools };
