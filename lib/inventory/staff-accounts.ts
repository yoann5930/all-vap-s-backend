import type { Role } from "@prisma/client";

export type StaffDef = {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  allowedStores: string[];
};

/** Comptes inventaire — définitions sans secrets. */
export const INVENTORY_STAFF: StaffDef[] = [
  {
    email: "lilie.froment@allvaps.fr",
    firstName: "Lilie",
    lastName: "Froment",
    role: "EMPLOYEE",
    allowedStores: ["HAUTMONT", "LE_QUESNOY"],
  },
  {
    email: "kelli.fasolla@allvaps.fr",
    firstName: "Kelli",
    lastName: "Fasolla",
    role: "EMPLOYEE",
    allowedStores: ["HAUTMONT", "LE_QUESNOY"],
  },
  {
    email: "aurelien.daillez@allvaps.fr",
    firstName: "Aurélien",
    lastName: "Daillez",
    role: "EMPLOYEE",
    allowedStores: ["HAUTMONT", "LE_QUESNOY"],
  },
  {
    email: "yoann@allvaps.fr",
    firstName: "Yoann",
    lastName: "All Vap's",
    role: "ADMIN",
    allowedStores: ["HAUTMONT", "LE_QUESNOY"],
  },
];
