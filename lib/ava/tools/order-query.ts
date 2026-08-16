/**
 * Lecture commandes Prisma — source de vérité, pas les e-mails.
 */
import type { OrderStatus } from "@prisma/client";
import { avaLog } from "@/lib/ava/logging";

export type AvaOrderSnapshot = {
  ok: boolean;
  spoken: string;
  counts: {
    toPrepare: number;
    preparing: number;
    ready: number;
    shipped: number;
    latestRef: string | null;
  };
};

const TO_PREPARE: OrderStatus[] = ["PAID"];
const PREPARING: OrderStatus[] = ["PREPARING"];
const READY: OrderStatus[] = ["PREPARED"];
const SHIPPED: OrderStatus[] = ["SHIPPED", "AT_RELAY"];

function shortRef(id: string): string {
  return id.slice(-8).toUpperCase();
}

export function detectOrderFocus(message: string): "ready" | "prepare" | "preparing" | "latest" | "late" | "all" {
  const n = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/pretes?|prete/.test(n)) return "ready";
  if (/en preparation/.test(n)) return "preparing";
  if (/a preparer|preparer/.test(n)) return "prepare";
  if (/derniere/.test(n)) return "latest";
  if (/en retard/.test(n)) return "late";
  return "all";
}

export async function speakAvaOrders(
  message: string,
  correlationId: string,
): Promise<AvaOrderSnapshot> {
  const empty: AvaOrderSnapshot = {
    ok: false,
    spoken: "Je n'ai pas pu vérifier les commandes.",
    counts: { toPrepare: 0, preparing: 0, ready: 0, shipped: 0, latestRef: null },
  };
  try {
    const { default: prisma } = await import("@/lib/prisma");
    const whereBase = { isAudit: false as const };
    const [toPrepare, preparing, ready, shipped, latest, lateReady] = await Promise.all([
      prisma.order.count({ where: { ...whereBase, status: { in: TO_PREPARE } } }),
      prisma.order.count({ where: { ...whereBase, status: { in: PREPARING } } }),
      prisma.order.count({ where: { ...whereBase, status: { in: READY } } }),
      prisma.order.count({ where: { ...whereBase, status: { in: SHIPPED } } }),
      prisma.order.findFirst({
        where: { ...whereBase, status: { notIn: ["CANCELLED", "REFUNDED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true },
      }),
      prisma.order.count({
        where: {
          ...whereBase,
          status: { in: ["PAID", "PREPARING"] },
          createdAt: { lt: new Date(Date.now() - 48 * 3600_000) },
        },
      }),
    ]);
    const latestRef = latest ? shortRef(latest.id) : null;
    avaLog("ORDER", correlationId, "order_snapshot", {
      toPrepare,
      preparing,
      ready,
    });
    const focus = detectOrderFocus(message);
    let spoken: string;
    if (focus === "ready") {
      spoken =
        ready === 0
          ? "Aucune commande n'est marquée prête pour le moment."
          : ready === 1
            ? "Il y a 1 commande prête."
            : `Il y a ${ready} commandes prêtes.`;
    } else if (focus === "prepare") {
      spoken =
        toPrepare === 0
          ? "Aucune commande à préparer."
          : `Il y a ${toPrepare} commande${toPrepare > 1 ? "s" : ""} à préparer.`;
    } else if (focus === "preparing") {
      spoken = `${preparing} en cours de préparation.`;
    } else if (focus === "latest") {
      spoken = latest
        ? `La dernière commande est ${latestRef}, statut ${latest.status}.`
        : "Je ne vois pas de commande récente.";
    } else if (focus === "late") {
      spoken =
        lateReady === 0
          ? "Je ne vois pas de commande en retard sur le critère 48 heures."
          : `${lateReady} commande${lateReady > 1 ? "s" : ""} payée${lateReady > 1 ? "s" : ""} ou en préparation depuis plus de 48 heures.`;
    } else {
      spoken = `Commandes : ${toPrepare} à préparer, ${preparing} en préparation, ${ready} prête${ready > 1 ? "s" : ""}.`;
    }
    return {
      ok: true,
      spoken,
      counts: { toPrepare, preparing, ready, shipped, latestRef },
    };
  } catch (error) {
    avaLog("ORDER", correlationId, "order_query_error", {
      err: error instanceof Error ? error.name : "unknown",
    });
    return empty;
  }
}
