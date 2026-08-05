/**
 * Seed sécurisé des comptes inventaire (Node uniquement — fs).
 * Écrit .local/credentials + met à jour staff-hashes.generated.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { INVENTORY_STAFF } from "../lib/inventory/staff-accounts";

function localDir() {
  return path.join(process.cwd(), ".local");
}
function credentialsPath() {
  return path.join(localDir(), "inventory-user-credentials.txt");
}
function hashesJsonPath() {
  return path.join(localDir(), "inventory-user-hashes.json");
}

/** MDP temporaires alphanumériques — faciles à saisir sur téléphone (pas de $ ! @ #). */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** FORCE_STAFF_CREDS=1 → régénère même si .local existe déjà. */
function shouldForceRegenerate(): boolean {
  return process.env.FORCE_STAFF_CREDS === "1" || process.env.FORCE_STAFF_CREDS === "true";
}

export type StaffCredentialRecord = {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tempPassword: string;
  passwordHash: string;
};

export function loadOrCreateStaffCredentials(): StaffCredentialRecord[] {
  mkdirSync(localDir(), { recursive: true });

  if (
    !shouldForceRegenerate() &&
    existsSync(hashesJsonPath()) &&
    existsSync(credentialsPath())
  ) {
    const hashes = JSON.parse(readFileSync(hashesJsonPath(), "utf8")) as Array<{
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      passwordHash: string;
    }>;
    const txt = readFileSync(credentialsPath(), "utf8");
    if (hashes.length >= INVENTORY_STAFF.length) {
      return hashes.map((h) => {
        const block = txt.split("---").find((b) => b.includes(h.email)) || "";
        const m = block.match(/MDP tmp\s*:\s*(.+)/);
        return { ...h, tempPassword: (m?.[1] || "").trim() };
      });
    }
  }

  const records: StaffCredentialRecord[] = INVENTORY_STAFF.map((s) => {
    const tempPassword = generateTempPassword();
    return {
      email: s.email,
      firstName: s.firstName,
      lastName: s.lastName,
      role: s.role,
      tempPassword,
      passwordHash: bcrypt.hashSync(tempPassword, 12),
    };
  });

  writeFileSync(
    hashesJsonPath(),
    JSON.stringify(
      records.map(({ tempPassword: _t, ...rest }) => rest),
      null,
      2
    ),
    { mode: 0o600 }
  );

  const lines = [
    "IDENTIFIANTS TEMPORAIRES INVENTAIRE ALL VAP'S",
    "CONFIDENTIEL — Remettre UNIQUEMENT à Yoann. Ne pas committer / publier.",
    `Généré le : ${new Date().toISOString()}`,
    "Chaque utilisateur DOIT changer son mot de passe à la première connexion.",
    "",
    ...records.map((r) =>
      [
        `Nom     : ${r.firstName} ${r.lastName}`,
        `Email   : ${r.email}`,
        `Rôle    : ${r.role}`,
        `MDP tmp : ${r.tempPassword}`,
        "---",
      ].join("\n")
    ),
    "",
    "Checksum emails (sha256) : " +
      createHash("sha256")
        .update(JSON.stringify(records.map((r) => r.email)))
        .digest("hex"),
  ];
  writeFileSync(credentialsPath(), lines.join("\n") + "\n", { mode: 0o600 });

  // Fichier TS importable par le seed DEMO (hashes seuls)
  const ts = `/**
 * Hashes bcrypt des comptes inventaire (sans MDP clair).
 * Régénéré par : npx tsx scripts/seed-inventory-staff.ts
 */
export const STAFF_PASSWORD_HASHES: Record<string, string> = {
${records.map((r) => `  ${JSON.stringify(r.email)}: ${JSON.stringify(r.passwordHash)},`).join("\n")}
};
`;
  writeFileSync(
    path.join(process.cwd(), "lib/inventory/staff-hashes.generated.ts"),
    ts
  );

  return records;
}

export function credentialsFilePaths() {
  return { credentialsPath: credentialsPath(), hashesPath: hashesJsonPath() };
}
