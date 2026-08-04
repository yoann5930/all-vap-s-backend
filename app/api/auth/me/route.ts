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
        phone: true,
        role: true,
        active: true,
        mustChangePassword: true,
        allowedStores: true,
        lastLoginAt: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (user && user.active === false) {
      await clearAuthCookie();
      return jsonResponse({ user: null });
    }

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
