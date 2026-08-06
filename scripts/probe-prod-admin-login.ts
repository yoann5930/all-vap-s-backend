import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const email = "admin@allvaps.fr";
  const candidates = [env.SEED_ADMIN_PASSWORD, "Admin123!"].filter(Boolean);
  for (const password of candidates) {
    const label = password === env.SEED_ADMIN_PASSWORD ? "seed" : "default";
    const res = await fetch("https://www.allvaps.fr/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const text = await res.text();
    console.log(`LOGIN status=${res.status} source=${label} body=${text.slice(0, 160)}`);
    const setCookie = res.headers.get("set-cookie");
    if (res.ok) {
      console.log(`HAS_SET_COOKIE=${Boolean(setCookie)}`);
      fs.writeFileSync(
        path.join(process.cwd(), ".tmp-prod-admin-cookie.txt"),
        setCookie || "",
        "utf8"
      );
      console.log("COOKIE_FILE_WRITTEN");
      return;
    }
  }
  console.log("LOGIN_FAILED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
