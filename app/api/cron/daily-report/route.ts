import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  runDailyReportJob,
  runMonthlyReportJob,
  runWeeklyReportJob,
} from "@/lib/reports/management-report";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

/** Cron rapports de gestion — Bearer CRON_SECRET */
export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }
    const daily = await runDailyReportJob();
    const weekly = await runWeeklyReportJob();
    const monthly = await runMonthlyReportJob();
    return jsonResponse({ ok: true, daily, weekly, monthly });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
