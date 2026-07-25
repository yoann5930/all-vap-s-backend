import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { generateSecureToken, hashToken } from "@/lib/security";

function isLocalAppUrl(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return /localhost|127\.0\.0\.1/i.test(appUrl);
}

/** Lazy secret — ne pas throw au import (sinon `next build` plante sans env Vercel). */
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Pendant le build / collect data, les secrets peuvent être absents.
    const duringBuild =
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.npm_lifecycle_event === "build";

    if (process.env.NODE_ENV === "production" && !isLocalAppUrl() && !duringBuild) {
      throw new Error("JWT_SECRET manquant — refus de démarrer en production");
    }

    if (!duringBuild) {
      console.warn("[All Vap's] JWT_SECRET absent — secret de développement utilisé");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
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
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !isLocalAppUrl(),
    sameSite: "lax",
    maxAge: 60 * 60 * 2,
    path: "/",
  });
}

export async function setRefreshCookie(rawToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(REFRESH_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !isLocalAppUrl(),
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * REFRESH_DAYS,
    path: "/",
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(REFRESH_COOKIE);
}

/** Crée un refresh token DB + cookie. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateSecureToken(48);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { tokenHash, userId, expiresAt },
  });

  await setRefreshCookie(raw);
  return raw;
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

  // Re-vérifie le rôle en base (révocation / démotion)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return null;

  return { userId: user.id, email: user.email, role: user.role };
}

export async function requireAuth(requiredRole?: Role): Promise<JwtPayload> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  if (requiredRole && user.role !== requiredRole && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export { COOKIE_NAME, REFRESH_COOKIE };
