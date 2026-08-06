import type { Role } from "@prisma/client";

/** Rôles autorisés à accéder à l'administration / inventaire staff. */
export const STAFF_ROLES: Role[] = ["EMPLOYEE", "ADMIN"];

export function isStaffRole(role: Role | string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as string[]).includes(role);
}

export function isOwnerRole(role: Role | string | null | undefined): boolean {
  // PROPRIETAIRE = alias historique local (non Prisma) → traité comme ADMIN
  return role === "ADMIN" || role === "PROPRIETAIRE";
}

/** Hiérarchie : ADMIN > EMPLOYEE > CUSTOMER (PROPRIETAIRE = alias ADMIN) */
const RANK: Record<string, number> = {
  CUSTOMER: 0,
  EMPLOYEE: 1,
  EMPLOYE: 1, // alias historique
  ADMIN: 2,
  PROPRIETAIRE: 2,
};

export function roleAtLeast(role: Role | string, minimum: Role | string): boolean {
  return (RANK[role] ?? 0) >= (RANK[minimum] ?? 99);
}

export const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Client",
  EMPLOYEE: "Employé",
  EMPLOYE: "Employé",
  ADMIN: "Administrateur",
  PROPRIETAIRE: "Propriétaire",
};
