import { readFileSync, existsSync } from "fs";
import nodemailer from "nodemailer";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnv(".env");
loadEnv(".env.local");

async function main() {
  const { getEmailConfig, getSmtpPassword } = await import("../lib/email/config");
  const c = getEmailConfig();
  const pw = getSmtpPassword();
  const cleaned = (pw || "").replace(/\s+/g, "");

  console.log(
    JSON.stringify(
      {
        host: c.smtp.host,
        port: c.smtp.port,
        secure: c.smtp.secure,
        userMask: c.smtp.user
          ? `${c.smtp.user.slice(0, 2)}…${c.smtp.user.slice(-2)}`
          : null,
        passwordPresent: !!pw,
        passwordLen: pw?.length ?? 0,
        passwordHasSpaces: pw ? /\s/.test(pw) : false,
        cleanedLen: cleaned.length,
        looksLike16CharAppPassword: /^[a-z0-9]{16}$/i.test(cleaned),
      },
      null,
      2
    )
  );

  if (!c.smtp.host || !c.smtp.user || !pw) {
    console.log("VERIFY_SKIP incomplete");
    return;
  }

  const attempts = [
    { label: "as-is-465-secure", host: c.smtp.host, port: 465, secure: true, pass: pw },
    {
      label: "cleaned-spaces-465",
      host: c.smtp.host,
      port: 465,
      secure: true,
      pass: cleaned,
    },
    {
      label: "as-is-587-starttls",
      host: c.smtp.host,
      port: 587,
      secure: false,
      requireTLS: true,
      pass: pw,
    },
    {
      label: "cleaned-587-starttls",
      host: c.smtp.host,
      port: 587,
      secure: false,
      requireTLS: true,
      pass: cleaned,
    },
  ];

  for (const a of attempts) {
    const transporter = nodemailer.createTransport({
      host: a.host!,
      port: a.port,
      secure: a.secure,
      requireTLS: a.requireTLS,
      auth: { user: c.smtp.user!, pass: a.pass },
    });
    try {
      await transporter.verify();
      console.log(`VERIFY_OK ${a.label}`);
    } catch (e: unknown) {
      const err = e as {
        code?: string;
        responseCode?: number;
        command?: string;
        response?: string;
        message?: string;
      };
      const msg = (err.message || "").replace(pw, "***").replace(cleaned, "***");
      console.log(
        `VERIFY_FAIL ${a.label}`,
        JSON.stringify({
          code: err.code,
          responseCode: err.responseCode,
          command: err.command,
          response: err.response?.slice(0, 160) || null,
          message: msg.slice(0, 220),
        })
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
