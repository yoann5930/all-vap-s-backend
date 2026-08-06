import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { getSumUpOpsDashboard } from "@/lib/sumup/ops-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAuth("ADMIN");
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const dashboard = await getSumUpOpsDashboard();
  return NextResponse.json(dashboard);
}
