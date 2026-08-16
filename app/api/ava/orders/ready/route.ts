import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/jwt";
import { resolveAvaAccess } from "@/lib/ava/central-router";
import prisma from "@/lib/prisma";
import {
  nextActionLabel,
  processUnhandledReadyOrders,
} from "@/lib/ava-order/ready-handler";

export const dynamic = "force-dynamic";

function deliveryLabel(method: string | null): string {
  switch (method) {
    case "STORE_PICKUP":
      return "retrait magasin";
    case "MONDIAL_RELAY":
      return "Mondial Relay";
    case "RELAIS_COLIS":
      return "Relais Colis";
    case "CHRONOPOST":
      return "Chronopost";
    default:
      return method || "à confirmer";
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser().catch(() => null);
    const access = resolveAvaAccess({
      auth: authUser
        ? { authenticated: true, role: authUser.role }
        : { authenticated: false, role: null },
      deviceTokenHeader: req.headers.get("x-ava-device-token"),
    });
    if (access.audience !== "internal") {
      return jsonResponse({ error: "FORBIDDEN" }, 403);
    }

    const resumed = await processUnhandledReadyOrders(20);

    const rows = await prisma.order.findMany({
      where: {
        OR: [
          { status: "PREPARED" },
          { readyHandledAt: { not: null }, status: { in: ["PREPARED", "AT_RELAY"] } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        customerName: true,
        customerEmail: true,
        deliveryMethod: true,
        status: true,
        readyAt: true,
        readyHandledAt: true,
        customerReadyEmailSentAt: true,
        shippingWorkflowStartedAt: true,
      },
    });

    return jsonResponse({
      ok: true,
      resumed,
      orders: rows.map((o) => ({
        id: o.id,
        ref: `AV-${o.id.slice(-8).toUpperCase()}`,
        customer: o.customerName || o.customerEmail,
        mode: deliveryLabel(o.deliveryMethod),
        status: o.status,
        nextAction: nextActionLabel(o.deliveryMethod),
        readyAt: o.readyAt,
        handled: !!o.readyHandledAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
