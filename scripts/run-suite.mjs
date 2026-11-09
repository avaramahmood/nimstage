// Runs one API test suite against a fresh throwaway server, then stops it.   node scripts/run-suite.mjs <name>
//   names: browser | payments | studio | features | login | a11y | foryou
// Each suite gets its own empty database, because several of them expect a clean start.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

const name = process.argv[2];
const suites = {
  browser: { port: 3011, script: ["node", "scripts/test-browser.mjs"], env: { NIMSTAGE_DEMO_PAYMENTS: "1", NIMIQ_RPC_URL: "http://localhost:4011" } },
  payments: { port: 3000, script: ["node", "scripts/test-payments.mjs"], env: { NIMSTAGE_DEMO_PAYMENTS: "1", NIMIQ_RPC_URL: "http://localhost:4010" } },
  studio: { port: 3001, script: ["npx", "tsx", "scripts/test-studio.mts"], env: { NIMSTAGE_DEMO_PAYMENTS: "1" } },
  features: { port: 3001, script: ["npx", "tsx", "scripts/test-features.mts"], env: { NIMSTAGE_DEMO_PAYMENTS: "1" } },
  login: { port: 3000, script: ["node", "scripts/test-login.mjs"], env: { NIMSTAGE_DEMO_PAYMENTS: "1" } },
  a11y: { port: 3000, script: ["npx", "vitest", "run", "tests/a11y.test.tsx"], env: { NIMSTAGE_DEMO_PAYMENTS: "1" } },
  foryou: { port: 3012, script: ["node", "scripts/test-foryou.mjs"], env: {} },
};
const s = suites[name];
if (!s) throw new Error("unknown suite: " + Object.keys(suites).join(", "));

const dir = `.data/suite-${name}`;
fs.rmSync(dir, { recursive: true, force: true });
const env = { ...process.env, PGLITE_DIR: dir, NIMSTAGE_DEMO: "1", DATABASE_URL: "", S3_BUCKET: "", PORT: String(s.port), ...s.env };
const server = spawn("npx", ["tsx", "server/index.ts"], { env, shell: true, stdio: "ignore" });
const base = `http://localhost:${s.port}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try {
    up = (await fetch(base + "/api/me")).ok;
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
  }
}
if (!up) {
  console.log("server did not start");
  process.exit(2);
}
const r = spawnSync(s.script[0], s.script.slice(1), { env: { ...env, BASE: base }, stdio: "inherit", shell: true });
spawnSync("powershell", ["-NoProfile", "-Command", `Get-NetTCPConnection -LocalPort ${s.port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`]);
server.kill();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
