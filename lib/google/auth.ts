import { google } from "googleapis";
import {
  getGoogleServiceAccountEmail,
  getGoogleServiceAccountPrivateKey,
  isDriveConfigured,
  isSheetsConfigured,
} from "@/lib/google/config";

export type GoogleAuthResult =
  | { ok: true; auth: InstanceType<typeof google.auth.JWT> }
  | { ok: false; code: "GOOGLE_NOT_CONFIGURED"; message: string };

function buildJwt(scopes: string[]): GoogleAuthResult {
  const email = getGoogleServiceAccountEmail();
  const key = getGoogleServiceAccountPrivateKey();
  if (!email || !key) {
    return {
      ok: false,
      code: "GOOGLE_NOT_CONFIGURED",
      message: "Variables GOOGLE_SERVICE_ACCOUNT_* manquantes — synchronisation désactivée.",
    };
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes,
  });

  return { ok: true, auth };
}

export function getDriveAuth(): GoogleAuthResult {
  if (!isDriveConfigured()) {
    return {
      ok: false,
      code: "GOOGLE_NOT_CONFIGURED",
      message: "Google Drive non configuré (GOOGLE_SYNC_ENABLED + credentials + folder).",
    };
  }
  return buildJwt(["https://www.googleapis.com/auth/drive.file"]);
}

export function getSheetsAuth(): GoogleAuthResult {
  if (!isSheetsConfigured()) {
    return {
      ok: false,
      code: "GOOGLE_NOT_CONFIGURED",
      message: "Google Sheets non configuré (GOOGLE_SYNC_ENABLED + credentials + spreadsheet).",
    };
  }
  return buildJwt(["https://www.googleapis.com/auth/spreadsheets"]);
}
