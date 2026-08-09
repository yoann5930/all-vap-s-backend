/**
 * Garde Preview-only pour AUTH_PREVIEW_TEST_PASSWORD.
 * Usage: npx tsx scripts/smoke-preview-auth-guard.ts
 */
import assert from "assert";
import {
  isPreviewAuthTestEnvironment,
  matchesPreviewTestCredentials,
} from "../lib/auth/preview-test-login";

const prev = { ...process.env };

function resetEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in prev)) delete process.env[k];
  }
  Object.assign(process.env, prev);
}

function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) console.log("OK ", name);
  else {
    failed += 1;
    console.log("FAIL", name);
  }
}

function main() {
  console.log("=== Preview auth guards ===");

  setEnv({
    VERCEL_ENV: "production",
    AUTH_PREVIEW_TEST_PASSWORD: "preview-secret-at-least-16",
  });
  ok("prod VERCEL_ENV → false", !isPreviewAuthTestEnvironment());
  ok(
    "prod credentials rejected",
    !matchesPreviewTestCredentials({
      email: "yoann@allvaps.fr",
      password: "preview-secret-at-least-16",
      host: "all-vap-s-backend-xxx.vercel.app",
    }).ok
  );

  setEnv({
    VERCEL_ENV: "preview",
    AUTH_PREVIEW_TEST_PASSWORD: "preview-secret-at-least-16",
    AUTH_PREVIEW_TEST_EMAIL: "yoann@allvaps.fr",
  });
  ok(
    "preview vercel.app → true",
    isPreviewAuthTestEnvironment({ host: "all-vap-s-backend-xxx.vercel.app" })
  );
  ok(
    "preview www.allvaps.fr → false",
    !isPreviewAuthTestEnvironment({ host: "www.allvaps.fr" })
  );
  ok(
    "preview credentials ok",
    matchesPreviewTestCredentials({
      email: "yoann@allvaps.fr",
      password: "preview-secret-at-least-16",
      host: "all-vap-s-backend-xxx.vercel.app",
    }).ok
  );
  ok(
    "wrong secret rejected",
    !matchesPreviewTestCredentials({
      email: "yoann@allvaps.fr",
      password: "wrong-secret-xxxxxxxxxxxx",
      host: "all-vap-s-backend-xxx.vercel.app",
    }).ok
  );
  ok(
    "non-allowlisted email rejected",
    !matchesPreviewTestCredentials({
      email: "allvaps70@gmail.com",
      password: "preview-secret-at-least-16",
      host: "all-vap-s-backend-xxx.vercel.app",
    }).ok
  );

  setEnv({ VERCEL_ENV: undefined, AUTH_PREVIEW_TEST_PASSWORD: "preview-secret-at-least-16" });
  ok("missing VERCEL_ENV → false", !isPreviewAuthTestEnvironment({ host: "x.vercel.app" }));

  resetEnv();
  console.log(failed === 0 ? "\nPASS" : `\nFAIL ${failed}`);
  assert.equal(failed, 0);
}

main();
