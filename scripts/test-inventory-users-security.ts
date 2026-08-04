/**
 * Tests sécurité comptes inventaire via HTTP (DEMO_MODE serveur local).
 * Ne log jamais les mots de passe en clair.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import {
  credentialsFilePaths,
  loadOrCreateStaffCredentials,
} from "./lib-staff-credentials";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

function ok(label: string) {
  console.log(`OK  ${label}`);
}

function parseCookies(res: Response): string {
  // Node fetch may expose getSetCookie
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [res.headers.get("set-cookie") || ""];
  return list
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { res, data, cookie: parseCookies(res) };
}

async function main() {
  const creds = loadOrCreateStaffCredentials();
  const paths = credentialsFilePaths();
  assert.equal(existsSync(paths.credentialsPath), true);
  assert.equal(existsSync(paths.hashesPath), true);

  const hashes = JSON.parse(readFileSync(paths.hashesPath, "utf8")) as Array<{
    email: string;
    passwordHash: string;
  }>;
  for (const h of hashes) {
    assert.match(h.passwordHash, /^\$2[aby]?\$/);
    assert.ok(!("tempPassword" in h), "hashes file must not contain plaintext passwords");
  }
  for (const c of creds) {
    assert.ok(c.tempPassword.length >= 10);
    assert.equal(await bcrypt.compare(c.tempPassword, c.passwordHash), true);
  }
  ok("bcrypt hashes + credentials locaux (hashes sans MDP clair)");

  const lilie = creds.find((c) => c.email.startsWith("lilie"))!;
  const kelli = creds.find((c) => c.email.startsWith("kelli"))!;
  const aurelien = creds.find((c) => c.email.startsWith("aurelien"))!;
  const yoann = creds.find((c) => c.email.startsWith("yoann"))!;

  // Lilie login
  const l = await login(lilie.email, lilie.tempPassword);
  assert.equal(l.res.status, 200);
  assert.equal(l.data.user.role, "EMPLOYEE");
  assert.equal(l.data.user.mustChangePassword, true);
  ok("Lilie se connecte (MDP temporaire, mustChangePassword)");

  // Lilie cannot call admin API
  const adminUsers = await fetch(`${BASE}/api/admin/users`, {
    headers: { Cookie: l.cookie },
  });
  assert.equal(adminUsers.status, 403);
  ok("Lilie → 403 sur API admin /users");

  const adminPageApi = await fetch(`${BASE}/api/admin/inventory/sessions`, {
    headers: { Cookie: l.cookie },
  });
  assert.ok([401, 403].includes(adminPageApi.status));
  ok("Lilie → refus API admin inventaire");

  // Kelli inventaire session requires password change first → MUST_CHANGE_PASSWORD
  const k = await login(kelli.email, kelli.tempPassword);
  assert.equal(k.res.status, 200);
  const kSession = await fetch(`${BASE}/api/inventaire/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: k.cookie,
    },
    body: JSON.stringify({ locationCode: "HAUTMONT" }),
  });
  const kBody = await kSession.json();
  assert.equal(kSession.status, 403);
  assert.match(String(kBody.error || ""), /mot de passe|Changement/i);
  ok("Kelli bloquée inventaire tant que MDP non changé");

  // Change password then inventaire
  const changed = await fetch(`${BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: k.cookie,
    },
    body: JSON.stringify({
      currentPassword: kelli.tempPassword,
      newPassword: "KelliSecure9!",
    }),
  });
  const changedBody = await changed.json();
  assert.equal(changed.status, 200, JSON.stringify(changedBody));
  assert.equal(changedBody.user.mustChangePassword, false);
  ok("changement MDP forcé OK");

  const k2cookie = parseCookies(changed) || k.cookie;
  const kSess2 = await fetch(`${BASE}/api/inventaire/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: k2cookie,
    },
    body: JSON.stringify({ locationCode: "LE_QUESNOY" }),
  });
  const kSess2Body = await kSess2.json();
  assert.equal(kSess2.status, 201, JSON.stringify(kSess2Body));
  ok("Kelli démarre inventaire Le Quesnoy après changement MDP");

  // Kelli cannot manage users
  const kUsers = await fetch(`${BASE}/api/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: k2cookie,
    },
    body: JSON.stringify({
      email: "hacker@allvaps.fr",
      firstName: "H",
      lastName: "X",
      role: "ADMIN",
    }),
  });
  assert.equal(kUsers.status, 403);
  ok("Kelli ne peut pas créer d'utilisateur (403)");

  // Aurélien: change pwd + scan line
  const a = await login(aurelien.email, aurelien.tempPassword);
  await fetch(`${BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: a.cookie,
    },
    body: JSON.stringify({
      currentPassword: aurelien.tempPassword,
      newPassword: "AurelienSecure9!",
    }),
  });
  const a2 = await login(aurelien.email, "AurelienSecure9!");
  const aSess = await fetch(`${BASE}/api/inventaire/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: a2.cookie,
    },
    body: JSON.stringify({ locationCode: "HAUTMONT" }),
  });
  const aSessBody = await aSess.json();
  assert.equal(aSess.status, 201, JSON.stringify(aSessBody));
  const lineRes = await fetch(
    `${BASE}/api/inventaire/sessions/${aSessBody.session.id}/lines`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE,
        Cookie: a2.cookie,
      },
      body: JSON.stringify({ barcode: "3760000000001", quantityCounted: 7 }),
    }
  );
  const lineBody = await lineRes.json();
  assert.equal(lineRes.status, 201, JSON.stringify(lineBody));
  assert.equal(lineBody.line.quantityCounted, 7);
  ok("Aurélien scan + quantité enregistrés");

  // Audit
  const y = await login(yoann.email, yoann.tempPassword);
  await fetch(`${BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: y.cookie,
    },
    body: JSON.stringify({
      currentPassword: yoann.tempPassword,
      newPassword: "YoannAdminSecure9!",
    }),
  });
  const y2 = await login(yoann.email, "YoannAdminSecure9!");
  const audit = await fetch(`${BASE}/api/admin/audit`, {
    headers: { Cookie: y2.cookie },
  });
  const auditBody = await audit.json();
  assert.equal(audit.status, 200, JSON.stringify(auditBody));
  assert.ok((auditBody.logs || []).length >= 1);
  ok("Yoann consulte le journal d'audit");

  const users = await fetch(`${BASE}/api/admin/users`, {
    headers: { Cookie: y2.cookie },
  });
  const usersBody = await users.json();
  assert.equal(users.status, 200);
  assert.ok((usersBody.users || []).length >= 4);
  ok("Yoann liste les utilisateurs");

  // Disable Lilie
  const lilieUser = (usersBody.users as Array<{ id: string; email: string }>).find(
    (u) => u.email === lilie.email
  )!;
  const disable = await fetch(`${BASE}/api/admin/users`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: y2.cookie,
    },
    body: JSON.stringify({ userId: lilieUser.id, active: false }),
  });
  assert.equal(disable.status, 200);
  const lilieAgain = await login(lilie.email, lilie.tempPassword);
  assert.equal(lilieAgain.res.status, 403);
  ok("compte désactivé ne peut plus se connecter");

  // Re-enable for ops
  await fetch(`${BASE}/api/admin/users`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: y2.cookie,
    },
    body: JSON.stringify({ userId: lilieUser.id, active: true }),
  });

  // Unauthenticated inventaire
  const anon = await fetch(`${BASE}/api/inventaire/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ locationCode: "HAUTMONT" }),
  });
  assert.equal(anon.status, 401);
  ok("inventaire anonymes refusés (401)");

  console.log("\nTous les tests sécurité HTTP : OK");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
