/**
 * Configuration Google Drive / Sheets — aucune clé en dur.
 * Les services restent désactivés tant que les variables sont vides.
 */

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function isGoogleSyncEnabled(): boolean {
  return env("GOOGLE_SYNC_ENABLED").toLowerCase() === "true";
}

export function getGoogleServiceAccountEmail(): string {
  return env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
}

/** Clé privée PEM ; les \n littéraux du .env sont normalisés. */
export function getGoogleServiceAccountPrivateKey(): string {
  return env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
}

export function getGoogleDriveFolderId(): string {
  return env("GOOGLE_DRIVE_FOLDER_ID");
}

export function getGoogleSheetsSpreadsheetId(): string {
  return env("GOOGLE_SHEETS_SPREADSHEET_ID");
}

export function isDriveConfigured(): boolean {
  return (
    isGoogleSyncEnabled() &&
    Boolean(getGoogleServiceAccountEmail()) &&
    Boolean(getGoogleServiceAccountPrivateKey()) &&
    Boolean(getGoogleDriveFolderId())
  );
}

export function isSheetsConfigured(): boolean {
  return (
    isGoogleSyncEnabled() &&
    Boolean(getGoogleServiceAccountEmail()) &&
    Boolean(getGoogleServiceAccountPrivateKey()) &&
    Boolean(getGoogleSheetsSpreadsheetId())
  );
}

export function googleConfigStatus() {
  return {
    syncEnabled: isGoogleSyncEnabled(),
    driveConfigured: isDriveConfigured(),
    sheetsConfigured: isSheetsConfigured(),
    hasEmail: Boolean(getGoogleServiceAccountEmail()),
    hasPrivateKey: Boolean(getGoogleServiceAccountPrivateKey()),
    hasDriveFolder: Boolean(getGoogleDriveFolderId()),
    hasSpreadsheet: Boolean(getGoogleSheetsSpreadsheetId()),
  };
}
