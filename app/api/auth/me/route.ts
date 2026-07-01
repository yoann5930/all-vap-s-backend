import { getAuthUser, clearAuthCookie } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return jsonResponse({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    return jsonResponse({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    await clearAuthCookie();
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
