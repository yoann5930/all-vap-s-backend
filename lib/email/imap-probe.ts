/**
 * Lecture IMAP de la boîte AVA (Gmail app password).
 * Ne jamais logger user / mot de passe / sujets / expéditeurs.
 */
import tls from "node:tls";
import { getSmtpPassword } from "@/lib/email/config";
import {
  classifyIncomingMail,
  type IncomingMailKind,
} from "@/lib/email/incoming-classify";

export type ImapProbeResult = {
  configured: boolean;
  ok: boolean;
  exists: number | null;
};

export type ImapKindCounts = Partial<Record<IncomingMailKind, number>>;

function imapUser(): string | null {
  const u = (
    process.env.IMAP_USER ||
    process.env.SMTP_USER ||
    process.env.MAIL_FROM_ADDRESS ||
    ""
  )
    .trim()
    .toLowerCase();
  return u.includes("@") ? u : null;
}

function imapPassword(): string | null {
  const p = (process.env.IMAP_PASS || "").trim().replace(/\s+/g, "");
  if (p) return p;
  return getSmtpPassword();
}

export function isImapConfigured(): boolean {
  return !!(imapUser() && imapPassword());
}

function encodeLogin(user: string, pass: string): string {
  return Buffer.from(`\u0000${user}\u0000${pass}`).toString("base64");
}

function imapHost(): string {
  return (process.env.IMAP_HOST || "imap.gmail.com").trim() || "imap.gmail.com";
}

function imapPort(): number {
  return Number(process.env.IMAP_PORT || "993") || 993;
}

function parseExists(buf: string): number {
  const matches = [...buf.matchAll(/\* (\d+) EXISTS/gi)];
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1][1] || 0);
}

function parseHeaderBlocks(buf: string): Array<{ from: string; subject: string; autoSubmitted: string }> {
  const blocks: Array<{ from: string; subject: string; autoSubmitted: string }> = [];
  const parts = buf.split(/\r?\n\r?\n/);
  for (const part of parts) {
    const from = (part.match(/^From:\s*(.+)$/im)?.[1] || "").trim();
    const subject = (part.match(/^Subject:\s*(.+)$/im)?.[1] || "").trim();
    const autoSubmitted = (part.match(/^Auto-Submitted:\s*(.+)$/im)?.[1] || "").trim();
    if (from || subject) blocks.push({ from, subject, autoSubmitted });
  }
  return blocks;
}

async function withImap<T>(
  run: (send: (line: string) => void, readUntil: (re: RegExp) => Promise<string>) => Promise<T>,
): Promise<T> {
  const user = imapUser();
  const pass = imapPassword();
  if (!user || !pass) {
    throw new Error("IMAP_NOT_CONFIGURED");
  }

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: imapHost(), port: imapPort(), servername: imapHost(), timeout: 12000 },
      () => {
        let buf = "";
        const waiters: Array<{ re: RegExp; done: (s: string) => void }> = [];

        const flush = () => {
          const next = waiters[0];
          if (!next) return;
          if (next.re.test(buf)) {
            waiters.shift();
            const out = buf;
            buf = "";
            next.done(out);
          }
        };

        const send = (line: string) => socket.write(line + "\r\n");
        const readUntil = (re: RegExp) =>
          new Promise<string>((done) => {
            waiters.push({ re, done });
            flush();
          });

        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          flush();
        });
        socket.on("error", (err) => {
          socket.destroy();
          reject(err);
        });
        socket.on("timeout", () => {
          socket.destroy();
          reject(new Error("IMAP_TIMEOUT"));
        });

        void (async () => {
          try {
            await readUntil(/\* OK/i);
            send(`A1 AUTHENTICATE PLAIN ${encodeLogin(user, pass)}`);
            const auth = await readUntil(/^A1 (OK|NO|BAD)/im);
            if (!/^A1 OK/im.test(auth)) {
              throw new Error("IMAP_AUTH_FAILED");
            }
            const result = await run(send, readUntil);
            send("A9 LOGOUT");
            socket.end();
            resolve(result);
          } catch (e) {
            socket.destroy();
            reject(e);
          }
        })();
      },
    );
    socket.on("error", reject);
  });
}

export async function probeAvaImapInbox(): Promise<ImapProbeResult> {
  if (!isImapConfigured()) {
    return { configured: false, ok: false, exists: null };
  }
  try {
    const exists = await withImap(async (send, readUntil) => {
      send("A2 SELECT INBOX");
      const selected = await readUntil(/^A2 (OK|NO|BAD)/im);
      if (!/^A2 OK/im.test(selected)) {
        throw new Error("IMAP_SELECT_FAILED");
      }
      return parseExists(selected);
    });
    return { configured: true, ok: true, exists };
  } catch {
    return { configured: true, ok: false, exists: null };
  }
}

/** Compte les kinds sans renvoyer de PII. */
export async function countImapInboxKinds(limit = 10): Promise<{
  configured: boolean;
  ok: boolean;
  scanned: number;
  kinds: ImapKindCounts;
}> {
  if (!isImapConfigured()) {
    return { configured: false, ok: false, scanned: 0, kinds: {} };
  }
  try {
    return await withImap(async (send, readUntil) => {
      send("A2 SELECT INBOX");
      const selected = await readUntil(/^A2 (OK|NO|BAD)/im);
      if (!/^A2 OK/im.test(selected)) {
        throw new Error("IMAP_SELECT_FAILED");
      }
      const exists = parseExists(selected);
      if (exists <= 0) {
        return { configured: true, ok: true, scanned: 0, kinds: {} };
      }
      const fromSeq = Math.max(1, exists - Math.max(1, limit) + 1);
      send(
        `A3 FETCH ${fromSeq}:${exists} BODY.PEEK[HEADER.FIELDS (FROM SUBJECT AUTO-SUBMITTED)]`,
      );
      const fetched = await readUntil(/^A3 (OK|NO|BAD)/im);
      if (!/^A3 OK/im.test(fetched)) {
        throw new Error("IMAP_FETCH_FAILED");
      }
      const kinds: ImapKindCounts = {};
      const blocks = parseHeaderBlocks(fetched);
      for (const b of blocks) {
        const decision = classifyIncomingMail({
          from: b.from,
          subject: b.subject,
          headers: { "auto-submitted": b.autoSubmitted },
        });
        kinds[decision.kind] = (kinds[decision.kind] || 0) + 1;
      }
      return { configured: true, ok: true, scanned: blocks.length, kinds };
    });
  } catch {
    return { configured: true, ok: false, scanned: 0, kinds: {} };
  }
}
