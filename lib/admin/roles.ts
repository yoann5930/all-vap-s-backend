import type { Role } from "@prisma/client";

/** Rôles autorisés à accéder à l'administration. */
export const STAFF_ROLES: Role[] = ["EMPLOYE", "ADMIN", "PROPRIETAIRE"];

export function isStaffRole(role: Role | string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as string[]).includes(role);
}

export function isOwnerRole(role: Role | string | null | undefined): boolean {
  return role === "PROPRIETAIRE" || role === "ADMIN";
}

/** Hiérarchie : PROPRIETAIRE > ADMIN > EMPLOYE > CUSTOMER */
const RANK: Record<string, number> = {
  CUSTOMER: 0,
  EMPLOYE: 1,
  ADMIN: 2,
  PROPRIETAIRE: 3,
};

export function roleAtLeast(role: Role | string, minimum: Role): boolean {
  return (RANK[role] ?? 0) >= (RANK[minimum] ?? 99);
}

export const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Client",
  EMPLOYE: "Employé",
  ADMIN: "Administrateur",
  PROPRIETAIRE: "Propriétaire",
};
