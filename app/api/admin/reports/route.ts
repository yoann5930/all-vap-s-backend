import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import { roleAtLeast } from "@/lib/admin/roles";
import { generateManagementReport } from "@/lib/reports/management-report";
import prisma from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé administrateur / propriétaire" }, 403);
    }
    const id = request.nextUrl.searchParams.get("id");
    const download = request.nextUrl.searchParams.get("download");

    if (id && download === "pdf") {
      const report = await prisma.managementReport.findUnique({ where: { id } });
      if (!report?.pdfPath) return jsonResponse({ error: "PDF indisponible" }, 404);
      const bytes = await readFile(path.join(process.cwd(), "storage", report.pdfPath));
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="rapport-${id}.pdf"`,
        },
      });
    }

    if (id) {
      const report = await prisma.managementReport.findUnique({ where: { id } });
      if (!report) return jsonResponse({ error: "Introuvable" }, 404);
      return jsonResponse(report);
    }

    const type = request.nextUrl.searchParams.get("type") || undefined;
    const reports = await prisma.managementReport.findMany({
      where: type ? { type } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        periodStart: true,
        periodEnd: true,
        timezone: true,
        emailStatus: true,
        hasRealPurchase: true,
        isTest: true,
        pdfPath: true,
        createdAt: true,
        emailLastError: true,
      },
    });
    return jsonResponse({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({
  action: z.enum(["generate", "resend"]),
  type: z.enum(["daily", "weekly", "monthly", "on_demand"]).default("on_demand"),
  periodKey: z
    .enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"])
    .optional(),
  sendEmail: z.boolean().optional(),
  reportId: z.string().optional(),
  isTest: z.boolean().optional(),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé administrateur / propriétaire" }, 403);
    }
    const body = postSchema.parse(await request.json());

    if (body.action === "resend" && body.reportId) {
      const existing = await prisma.managementReport.findUnique({ where: { id: body.reportId } });
      if (!existing) return jsonResponse({ error: "Introuvable" }, 404);
      const result = await generateManagementReport({
        type: "on_demand",
        periodKey: "today",
        sendEmail: true,
        generatedBy: user.userId,
        force: true,
        isTest: body.isTest,
      });
      return jsonResponse({ ...result, note: "Régénération / renvoi à la demande" });
    }

    const result = await generateManagementReport({
      type: body.type,
      periodKey: body.periodKey,
      sendEmail: body.sendEmail ?? false,
      generatedBy: user.userId,
      isTest: body.isTest,
      force: body.force,
    });
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
