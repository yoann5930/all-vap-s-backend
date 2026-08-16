import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { markOrderReady } from "@/lib/ava-order/mark-ready";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStaff();
    const { id } = await context.params;
    const result = await markOrderReady(id, {
      changedById: auth.userId,
      actor: auth.email,
    });
    if (!result.ok) {
      const status = result.error === "NOT_FOUND" ? 404 : 400;
      return jsonResponse({ error: result.error, status: result.status }, status);
    }
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
