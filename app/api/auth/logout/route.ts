import { NextRequest } from "next/server";
import { logoutUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await logoutUser();
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
