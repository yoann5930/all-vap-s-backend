/**
 * Vérifie la réception réelle Gmail via IMAP (app password).
 * N'imprime jamais le mot de passe. Résultats masqués.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import tls from "tls";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const user = (process.env.SMTP_USER || "").trim();
const pass = (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS || "")
  .trim()
  .replace(/\s+/g, "");

const subjects = [
  "Bienvenue chez All Vap's",
  "Confirmez votre adresse e-mail All Vap's",
  "Nouvelle inscription",
  "Paiement confirmé",
  "Nouvelle commande payée",
  "Bon de commande",
  "Facture AV-2026",
  "All Vap's — Nouvelle commande",
  "5YKHJJBY",
  "6OWWSB91",
  "4NDGPYGB",
];

function encodeLogin(u: string, p: string) {
  return Buffer.from(`\u0000${u}\u0000${p}`).toString("base64");
}

async function imapSearch(): Promise<{
  ok: boolean;
  error?: string;
  inboxExists?: number;
  matches: { subjectHint: string; count: number; samples: string[] }[];
  rawRecentSubjects: string[];
}> {
  if (!user || !pass) {
    return { ok: false, error: "IMAP_CREDENTIALS_MISSING", matches: [], rawRecentSubjects: [] };
  }

  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: "imap.gmail.com", port: 993, servername: "imap.gmail.com" },
      () => {
        let buf = "";
        let step = 0;
        const recentSubjects: string[] = [];
        const tagCounts: Record<string, { count: number; samples: string[] }> = {};
        for (const s of subjects) tagCounts[s] = { count: 0, samples: [] };

        const send = (line: string) => socket.write(line + "\r\n");

        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          if (step === 0 && /\* OK/i.test(buf)) {
            step = 1;
            buf = "";
            send(`A1 AUTHENTICATE PLAIN ${encodeLogin(user, pass)}`);
          } else if (step === 1 && /^A1 OK/im.test(buf)) {
            step = 2;
            buf = "";
            send(`A2 SELECT INBOX`);
          } else if (step === 1 && /^A1 NO|^A1 BAD/im.test(buf)) {
            socket.end();
            resolve({
              ok: false,
              error: "IMAP_AUTH_FAILED",
              matches: [],
              rawRecentSubjects: [],
            });
          } else if (step === 2 && /^A2 OK/im.test(buf)) {
            const existsMatch = buf.match(/\* (\d+) EXISTS/i);
            const exists = existsMatch ? Number(existsMatch[1]) : 0;
            step = 3;
            buf = "";
            // last ~80 messages
            const from = Math.max(1, exists - 79);
            send(`A3 FETCH ${from}:${exists} (BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])`);
            ;(socket as any)._exists = exists;
          } else if (step === 3 && /^A3 OK/im.test(buf)) {
            const blocks = buf.split(/\* \d+ FETCH/i).slice(1);
            for (const block of blocks) {
              const subj = (block.match(/Subject:\s*(.+)/i)?.[1] || "").trim();
              const date = (block.match(/Date:\s*(.+)/i)?.[1] || "").trim();
              if (!subj) continue;
              // decode simple MIME encoded-word UTF-8 B
              let decoded = subj.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => {
                try {
                  return Buffer.from(b, "base64").toString("utf8");
                } catch {
                  return _;
                }
              });
              decoded = decoded.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, q) =>
                q.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__: string, h: string) =>
                  String.fromCharCode(parseInt(h, 16))
                )
              );
              recentSubjects.push(`${date} | ${decoded}`);
              for (const hint of subjects) {
                if (decoded.toLowerCase().includes(hint.toLowerCase())) {
                  tagCounts[hint].count += 1;
                  if (tagCounts[hint].samples.length < 3) {
                    tagCounts[hint].samples.push(decoded.slice(0, 120));
                  }
                }
              }
            }
            send(`A4 LOGOUT`);
            step = 4;
          } else if (step === 4 && (/^\* BYE/im.test(buf) || /^A4 OK/im.test(buf))) {
            socket.end();
            resolve({
              ok: true,
              inboxExists: (socket as any)._exists,
              matches: subjects.map((s) => ({
                subjectHint: s,
                count: tagCounts[s].count,
                samples: tagCounts[s].samples,
              })),
              rawRecentSubjects: recentSubjects.slice(-40),
            });
          }
        });

        socket.on("error", (e) => {
          resolve({
            ok: false,
            error: e.message,
            matches: [],
            rawRecentSubjects: [],
          });
        });

        setTimeout(() => {
          try {
            socket.end();
          } catch {
            /* ignore */
          }
          resolve({
            ok: false,
            error: "IMAP_TIMEOUT",
            matches: [],
            rawRecentSubjects: recentSubjects,
          });
        }, 45000);
      }
    );
  });
}

async function main() {
  const campaignId = "CLIENT-TEST-ACHAT-20260730073502";
  const dir = join("docs/test-client", campaignId, "evidence");
  mkdirSync(dir, { recursive: true });
  const result = await imapSearch();
  // Never include credentials
  const safe = {
    checkedAt: new Date().toISOString(),
    mailboxMasked: user ? `${user[0]}***@${user.split("@")[1]}` : null,
    ...result,
  };
  writeFileSync(join(dir, "94-gmail-imap-check.json"), JSON.stringify(safe, null, 2));
  console.log(JSON.stringify(safe, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
