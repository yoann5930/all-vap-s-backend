import { refreshAccessToken } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";
import { NextRequest } from "next/server";

/** Renouvelle l’access JWT via cookie refresh httpOnly. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const result = await refreshAccessToken();
    if (!result) {
      throw new Error("UNAUTHORIZED");
    }
    return jsonResponse({
      token: result.token,
      user: {
        id: result.user.userId,
        email: result.user.email,
        role: result.user.role,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
