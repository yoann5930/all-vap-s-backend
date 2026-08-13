import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { generateSecureToken, hashToken } from "@/lib/security";
import { isOwnerRole, isStaffRole, roleAtLeast } from "@/lib/admin/roles";
import {
  isLocalAppUrl,
  requiresHardenedSecrets,
} from "@/lib/production-guards";

/**
 * Secure cookie si la requête est réellement en HTTPS (tunnel Cloudflare, prod),
 * pas seulement selon NODE_ENV / APP_URL (souvent localhost en démo tunnel).
 */
async function cookieSecureFlag(): Promise<boolean> {
  try {
    const h = await headers();
    const xf = (h.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
    if (xf === "https") return true;
    if (xf === "http") return false;
    const host = (h.get("host") || "").toLowerCase();
    if (host.includes("localhost") || host.startsWith("127.0.0.1")) return false;
  } catch {
    /* hors contexte requête */
  }
  if (isLocalAppUrl() && !requiresHardenedSecrets()) return false;
  return process.env.NODE_ENV === "production" || requiresHardenedSecrets();
}

/** Lazy secret — ne pas throw au import pendant `next build` (env absents sur Vercel build). */
function getJwtSecret(): Uint8Array {
  const secret = (process.env.JWT_SECRET || "").trim();
  const duringBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

  if (!secret) {
    if (requiresHardenedSecrets() && !duringBuild) {
      throw new Error("JWT_SECRET manquant — refus de démarrer en déploiement");
    }
    if (!duringBuild) {
      console.warn("[All Vap's] JWT_SECRET absent — secret de développement utilisé");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }

  if (secret.length < 32 && requiresHardenedSecrets() && !duringBuild) {
    throw new Error("JWT_SECRET trop court (< 32) — refus en déploiement");
  }
  if (secret.length < 32 && process.env.NODE_ENV === "production") {
    console.warn("[All Vap's] JWT_SECRET trop court (< 32 caractères) — renforcez-le");
  }
  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = "allvaps_token";
const REFRESH_COOKIE = "allvaps_refresh";
const ACCESS_EXPIRY = "2h";
const REFRESH_DAYS = 7;

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  const secure = await cookieSecureFlag();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 2,
    path: "/",
  });
}

export async function setRefreshCookie(rawToken: string) {
  const cookieStore = await cookies();
  const secure = await cookieSecureFlag();
  cookieStore.set(REFRESH_COOKIE, rawToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * REFRESH_DAYS,
    path: "/",
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  const secure = await cookieSecureFlag();
  // delete() seul peut laisser un cookie Secure/non-Secure orphelin selon le contexte
  cookieStore.set(COOKIE_NAME, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  cookieStore.set(REFRESH_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Crée un refresh token DB (+ cookie optionnel via next/headers). */
export async function issueRefreshToken(
  userId: string,
  opts?: { setCookie?: boolean }
): Promise<string> {
  const raw = generateSecureToken(48);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { tokenHash, userId, expiresAt },
  });

  if (opts?.setCookie !== false) {
    await setRefreshCookie(raw);
  }
  return raw;
}

/** Options cookie session access (2h) — à appliquer sur NextResponse en prod. */
export function accessCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 2,
  };
}

/** Options cookie refresh (7j). */
export function refreshCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * REFRESH_DAYS,
  };
}

/** Renouvelle l’access token à partir du cookie refresh. */
export async function refreshAccessToken(): Promise<{ token: string; user: JwtPayload } | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = hashToken(raw);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return null;
  }

  const payload: JwtPayload = {
    userId: stored.user.id,
    email: stored.user.email,
    role: stored.user.role,
  };

  const token = await signToken(payload);
  await setAuthCookie(token);
  return { token, user: payload };
}

export async function revokeRefreshToken(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!raw) return;
  const tokenHash = hashToken(raw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  let token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    const headerStore = await headers();
    const auth = headerStore.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) token = match[1].trim();
  }

  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  // Re-vérifie le rôle / actif en base (révocation / démotion / désactivation)
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, active: true },
    });
    if (!user) return null;
    if (user.active === false) return null;
    return { userId: user.id, email: user.email, role: user.role };
  } catch (err) {
    // Colonnes inventaire absentes : ne pas invalider un JWT pourtant valide
    console.error(
      "[auth] getAuthUser DB check failed, fallback JWT claims:",
      err instanceof Error ? err.message.slice(0, 200) : err
    );
    if (!payload.userId || !payload.email || !payload.role) return null;
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}

export async function requireAuth(requiredRole?: Role): Promise<JwtPayload> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  if (requiredRole) {
    // ADMIN (et alias PROPRIETAIRE) passent pour tout gate staff / inventaire
    if (isOwnerRole(user.role)) {
      return user;
    }
    if (requiredRole === "EMPLOYEE" || (requiredRole as string) === "EMPLOYE") {
      if (!isStaffRole(user.role)) throw new Error("FORBIDDEN");
    } else if (user.role !== requiredRole && !roleAtLeast(user.role, requiredRole)) {
      throw new Error("FORBIDDEN");
    }
  }
  return user;
}

/** Accès back-office : EMPLOYEE ou ADMIN. */
export async function requireStaff(): Promise<JwtPayload> {
  const user = await getAuthUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!isStaffRole(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export { COOKIE_NAME, REFRESH_COOKIE };
