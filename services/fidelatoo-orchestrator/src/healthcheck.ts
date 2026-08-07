const base = (process.env.ORCH_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const res = await fetch(`${base}/health`, { cache: "no-store" });
const json = await res.json();
console.log(JSON.stringify({ http: res.status, ...json }, null, 2));
if (!res.ok || json.ok !== true) process.exit(1);
