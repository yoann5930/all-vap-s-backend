/**
 * Check-up AVA — mêmes probes que le dashboard. Jamais « tout fonctionne » sans test.
 */
import { checkApplication, checkDatabase } from "@/lib/health/checks";
import { getEmailConfig } from "@/lib/email/config";
import { isGmailApiConfigured } from "@/lib/email/gmail-labels";
import { isImapConfigured, probeAvaImapInbox } from "@/lib/email/imap-probe";
import { verifyEmailTransport } from "@/lib/email/transport";
import { speakAvaOrders } from "@/lib/ava/tools/order-query";
import { speakAvaShipping } from "@/lib/ava/tools/shipping-status";
import { AVA_SYSTEM_ID } from "@/lib/ava/ava-core";
import { avaLog, newAvaCorrelationId } from "@/lib/ava/logging";
import { isDemoMode } from "@/lib/shipping/real-shipping-guard";
import { FidelatooWriteGuardNote } from "@/lib/ava/health/fidelatoo-note";

export type AvaCheckStatus =
  | "OK"
  | "DEGRADED"
  | "ERROR"
  | "NOT_CONFIGURED"
  | "NOT_TESTED";

export type AvaCheckItem = {
  module: string;
  status: AvaCheckStatus;
  latencyMs: number;
  message: string;
  timestamp: string;
};

function item(
  module: string,
  status: AvaCheckStatus,
  started: number,
  message: string,
): AvaCheckItem {
  return {
    module,
    status,
    latencyMs: Date.now() - started,
    message,
    timestamp: new Date().toISOString(),
  };
}

export async function runAvaCheckup(opts?: {
  correlationId?: string;
  only?: string | null;
}): Promise<{
  correlationId: string;
  items: AvaCheckItem[];
  spoken: string;
}> {
  const correlationId = opts?.correlationId || newAvaCorrelationId();
  const only = (opts?.only || "").toLowerCase();
  const items: AvaCheckItem[] = [];
  avaLog("HEALTH", correlationId, "checkup_start", { only: only || "all" });

  async function maybe(name: string, run: () => Promise<AvaCheckItem>) {
    if (only && !name.includes(only) && only !== "all" && only !== "complet") return;
    items.push(await run());
  }

  await maybe("core", async () => {
    const t = Date.now();
    return item("Cœur AVA", AVA_SYSTEM_ID === "ava-main" ? "OK" : "ERROR", t, `id=${AVA_SYSTEM_ID}`);
  });

  await maybe("server", async () => {
    const t = Date.now();
    const app = checkApplication();
    return item("Serveur", app.status === "ok" ? "OK" : "ERROR", t, "processus Node");
  });

  await maybe("base", async () => {
    const t = Date.now();
    const db = await checkDatabase();
    if (db.status === "ok") return item("Base", "OK", t, `SELECT 1 ${db.ms ?? 0}ms`);
    return item("Base", "ERROR", t, db.detail || "db_error");
  });

  await maybe("site", async () => {
    const t = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch("https://www.allvaps.fr/api/health", {
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) return item("Site", "ERROR", t, `http ${res.status}`);
      const data = (await res.json()) as { status?: string; checks?: { database?: string } };
      if (data.status === "ok" && data.checks?.database === "ok") {
        return item("Site", "OK", t, "www.allvaps.fr health ok");
      }
      return item("Site", "DEGRADED", t, "site répond, contrôle incomplet");
    } catch {
      return item("Site", "ERROR", t, "injoignable");
    }
  });

  await maybe("stock", async () => {
    const t = Date.now();
    try {
      const { default: prisma } = await import("@/lib/prisma");
      const n = await prisma.stockLocation.count();
      return item("Stocks", n > 0 ? "OK" : "DEGRADED", t, `${n} emplacements`);
    } catch {
      return item("Stocks", "ERROR", t, "Je n'ai pas pu vérifier le stock.");
    }
  });

  await maybe("commande", async () => {
    const t = Date.now();
    const orders = await speakAvaOrders("combien de commandes à préparer", correlationId);
    return item("Commandes", orders.ok ? "OK" : "ERROR", t, orders.spoken);
  });

  await maybe("mail", async () => {
    const t = Date.now();
    const cfg = getEmailConfig();
    if (!cfg.configured) {
      return item("E-mail", "NOT_CONFIGURED", t, "missing_credentials");
    }
    const verify = await verifyEmailTransport();
    if (!verify.ok) {
      return item("E-mail", "ERROR", t, "smtp_verify_failed");
    }
    if (isGmailApiConfigured()) {
      return item("E-mail", "OK", t, "smtp+gmail_api");
    }
    if (isImapConfigured()) {
      const inbox = await probeAvaImapInbox();
      if (inbox.ok) return item("E-mail", "OK", t, "smtp+imap");
      return item("E-mail", "DEGRADED", t, "smtp_ok_imap_failed");
    }
    return item("E-mail", "DEGRADED", t, "smtp_ok_inbox_not_configured");
  });

  await maybe("fidelatoo", async () => {
    const t = Date.now();
    return item("Fidelatoo", "DEGRADED", t, FidelatooWriteGuardNote);
  });

  await maybe("transporteur", async () => {
    const t = Date.now();
    const ship = speakAvaShipping(correlationId);
    return item("Transporteurs", isDemoMode() ? "DEGRADED" : "OK", t, ship.spoken);
  });

  await maybe("nicotine", async () => {
    const t = Date.now();
    const { maxMgMl } = await import("@/lib/nicotine");
    const ok = maxMgMl("FREEBASE") === 15 && maxMgMl("SALT") === 20;
    return item("Nicotine", ok ? "OK" : "ERROR", t, "plafonds 15/20");
  });

  await maybe("memoire", async () => {
    const t = Date.now();
    try {
      const { AvaMemoryService } = await import("@/lib/ava/memory-service");
      await AvaMemoryService.readSession("checkup");
      return item("Mémoire", "OK", t, "session store joignable");
    } catch {
      return item("Mémoire", "DEGRADED", t, "store mémoire indisponible");
    }
  });

  const spoken = formatSpoken(items);
  avaLog("HEALTH", correlationId, "checkup_done", { n: items.length });
  return { correlationId, items, spoken };
}

export function formatSpoken(items: AvaCheckItem[]): string {
  const lines = items.map((i) => {
    const label =
      i.status === "OK"
        ? "OK"
        : i.status === "DEGRADED"
          ? "dégradé"
          : i.status === "NOT_CONFIGURED"
            ? "non configuré"
            : i.status === "NOT_TESTED"
              ? "non testé"
              : "erreur";
    return `${i.module} : ${label}.`;
  });
  return `Check-up terminé. ${lines.join(" ")}`;
}

export function checkupTargetFromMessage(message: string): string | null {
  const n = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/micro/.test(n)) return "micro";
  if (/memoire/.test(n)) return "memoire";
  if (/site/.test(n) && /teste/.test(n)) return "site";
  if (/stock/.test(n) && /teste/.test(n)) return "stock";
  if (/commande/.test(n) && /teste/.test(n)) return "commande";
  if (/mail|boite/.test(n) && /teste/.test(n)) return "mail";
  if (/fidelatoo/.test(n) && /teste/.test(n)) return "fidelatoo";
  if (/serveur/.test(n) && /teste/.test(n)) return "server";
  if (/check[- ]?up|systeme|complet/.test(n)) return "all";
  return null;
}
