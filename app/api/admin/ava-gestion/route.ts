import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import { answerAvaGestion } from "@/lib/ava-gestion/advisor";
import prisma from "@/lib/prisma";
import type { DatePeriod } from "@/lib/timezone/shop-tz";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  periodKey: z
    .enum([
      "today",
      "yesterday",
      "day_before_yesterday",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "this_year",
      "last_24h",
      "last_7d",
      "last_30d",
    ])
    .optional(),
});

/** A.V.A. Gestion — staff uniquement. Mode forcé gestion (pas de catalogue). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    const body = bodySchema.parse(await request.json());

    await prisma.avaGestionMessage.create({
      data: {
        userId: user.userId,
        role: "user",
        content: body.message,
      },
    });

    const reply = await answerAvaGestion({
      message: body.message,
      role: user.role,
      periodKey: body.periodKey as DatePeriod | undefined,
    });

    await prisma.avaGestionMessage.create({
      data: {
        userId: user.userId,
        role: "assistant",
        content: reply.text,
        linksJson: reply.links,
        metaJson: {
          periodLabel: reply.periodLabel,
          source: reply.source,
          lastSyncAt: reply.lastSyncAt,
          missingData: reply.missingData,
          mode: "gestion",
        },
      },
    });

    return jsonResponse(reply);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const user = await requireStaff();
    const messages = await prisma.avaGestionMessage.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return jsonResponse({
      mode: "gestion",
      messages: messages.reverse(),
      suggestions: [
        "Résumé du jour",
        "Commandes à préparer",
        "Paiements à vérifier",
        "Stocks faibles",
        "Colis en anomalie",
        "Rapport complet",
        "Compare aujourd'hui avec hier",
        "Qu'est-ce que j'ai à faire aujourd'hui ?",
      ],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
