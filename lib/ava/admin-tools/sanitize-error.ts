/**
 * Ne jamais remonter de dump Prisma / SQL / stack au chat Admin.
 */
export function sanitizeAdminToolError(reason: unknown): string {
  const raw =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "indisponible";

  if (
    /prisma|invalid\s*`|invocation:|findMany|findUnique|findFirst|where:|Unknown arg|column .* does not exist|does not exist in the current database/i.test(
      raw
    )
  ) {
    return "données métier temporairement indisponibles";
  }
  if (/timeout:/i.test(raw)) return "délai dépassé";
  if (raw.length > 140) return "indisponible momentanément";
  return raw.trim() || "indisponible";
}

/** Nettoie un texte déjà composé qui aurait fuité une erreur technique. */
export function stripTechnicalLeak(text: string, fallback: string): string {
  if (!text) return fallback;
  if (
    /Invalid\s*`prisma\.|prisma\.order\.|invocation:\s*\{|Unknown arg|isAudit:\s*false\s*~~~~~~/i.test(
      text
    )
  ) {
    return fallback;
  }
  return text;
}
