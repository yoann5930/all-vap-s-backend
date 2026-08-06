import { stores } from "@/lib/stores";
import { getEmailConfig } from "./config";

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getAvaSignatureText(): string {
  const hautmont = stores.find((s) => s.id === "hautmont")!;
  const quesnoy = stores.find((s) => s.id === "le-quesnoy")!;
  const cfg = getEmailConfig();
  return [
    "A.V.A.",
    "Assistante All Vap's",
    "",
    hautmont.name,
    `${hautmont.address}`,
    `${hautmont.postalCode} ${hautmont.city}`,
    "",
    quesnoy.name,
    `${quesnoy.address}`,
    `${quesnoy.postalCode} ${quesnoy.city}`,
    "",
    `E-mail : ${cfg.fromAddress}`,
  ].join("\n");
}

export function getAvaSignatureHtml(): string {
  const hautmont = stores.find((s) => s.id === "hautmont")!;
  const quesnoy = stores.find((s) => s.id === "le-quesnoy")!;
  const cfg = getEmailConfig();
  return `
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;color:#4b5563;font-size:13px;line-height:1.55;">
      <p style="margin:0 0 4px;font-weight:600;color:#111827;">A.V.A.</p>
      <p style="margin:0 0 14px;">Assistante All Vap's</p>
      <p style="margin:0;">${escapeHtml(hautmont.name)}<br/>${escapeHtml(hautmont.address)}<br/>${escapeHtml(hautmont.postalCode)} ${escapeHtml(hautmont.city)}</p>
      <p style="margin:12px 0 0;">${escapeHtml(quesnoy.name)}<br/>${escapeHtml(quesnoy.address)}<br/>${escapeHtml(quesnoy.postalCode)} ${escapeHtml(quesnoy.city)}</p>
      <p style="margin:14px 0 0;">E-mail : <a href="mailto:${escapeHtml(cfg.fromAddress)}" style="color:#111827;">${escapeHtml(cfg.fromAddress)}</a></p>
    </div>
  `;
}

export function wrapEmailHtml(params: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const cfg = getEmailConfig();
  const logoUrl = `${cfg.publicUrl}/brand/logo-official.png`;
  const cta =
    params.ctaLabel && params.ctaUrl
      ? `<p style="margin:28px 0 8px;text-align:center;">
          <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:14px;">
            ${escapeHtml(params.ctaLabel)}
          </a>
        </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:22px 24px 8px;text-align:center;background:#0f172a;">
              <img src="${escapeHtml(logoUrl)}" alt="All Vap's" width="140" style="display:inline-block;max-width:140px;height:auto;border:0;"/>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 4px;text-align:center;background:#0f172a;color:#e5e7eb;font-size:12px;font-family:Arial,Helvetica,sans-serif;">
              A.V.A. — Assistante All Vap's
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;color:#111827;font-size:15px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
              ${params.bodyHtml}
              ${cta}
              ${getAvaSignatureHtml()}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 24px 20px;color:#9ca3af;font-size:11px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
              All Vap's — réservé aux adultes.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function wrapEmailText(body: string): string {
  return `${body.trim()}\n\n—\n${getAvaSignatureText()}\n`;
}

export { escapeHtml };
