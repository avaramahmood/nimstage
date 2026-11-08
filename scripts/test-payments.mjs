// Runs the real /api/payments routes against a MOCK Nimiq JSON-RPC node that returns the
// field shape from core-rs-albatross (`to`, `value`, `recipientData` hex, `confirmations`,
// `executionResult`). It proves our verification rules; it does not prove a live node's
// exact response, which needs a real endpoint.
//
// Start the dev server with:  NIMIQ_RPC_URL=http://localhost:4010 npm run dev
// then run:                   node scripts/test-payments.mjs
import http from "node:http";

const base = process.env.BASE ?? "http://localhost:3000";
let scenario = {};

const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { params, id } = JSON.parse(body);
    const tx = scenario[params[0]];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(tx ? { jsonrpc: "2.0", id, result: { data: tx, metadata: null } } : { jsonrpc: "2.0", id, error: { code: -32602, message: "not found" } }));
  });
});
await new Promise((r) => mock.listen(4010, r));

const login = async () => {
  const r = await fetch(base + "/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: "fan" }) });
  return r.headers.get("set-cookie").split(";")[0];
};
const cookie = await login();
const post = async (path, body) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  return r.json();
};
const hex = (s) => Buffer.from(s, "utf8").toString("hex");

let failed = 0;
const hash = (n) => n.toString(16).padStart(64, "0");
async function run(name, mutate, expect, kind = { kind: "ticket", refId: "s-kofi-1" }) {
  const { intent } = await post("/api/payments/intent", kind);
  const txHash = hash(Math.floor(Math.random() * 1e12));
  const good = { to: intent.recipient, value: intent.amountLuna, recipientData: hex(intent.memo), confirmations: 3, executionResult: true, blockNumber: 100 };
  scenario[txHash] = mutate ? mutate(good, intent) : good;
  if (mutate && mutate(good, intent) === null) delete scenario[txHash];
  const res = await post("/api/payments/confirm", { intentId: intent.id, txHash });
  const ok = res.status === expect;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(42)} -> ${res.status}${res.reason ? ` (${res.reason})` : ""}`);
  return { intent, txHash };
}

await run("correct payment confirms", null, "confirmed");
await run("wrong recipient", (t) => ({ ...t, to: "NQ07 0000 0000 0000 0000 0000 0000 0000 0001" }), "failed");
await run("underpaid by 1 Luna", (t) => ({ ...t, value: t.value - 1 }), "failed");
await run("overpaid is accepted", (t) => ({ ...t, value: t.value + 5000 }), "confirmed");
await run("memo from another purchase", (t) => ({ ...t, recipientData: hex("NS:someoneelse1") }), "failed");
await run("no memo at all", (t) => ({ ...t, recipientData: "" }), "failed");
await run("execution failed on-chain", (t) => ({ ...t, executionResult: false }), "failed");
await run("not yet confirmed (0 confirmations)", (t) => ({ ...t, confirmations: 0 }), "pending");
await run("tx not found yet", () => null, "pending");
await run("address with spaces vs without matches", (t) => ({ ...t, to: t.to.replace(/\s/g, "") }), "confirmed");
await run("tip: correct", (t) => t, "confirmed", { kind: "tip", refId: "a-kofistatic", amountLuna: 500000 });

// one on-chain transaction must not pay for two purchases
const a = await run("first use of a tx", null, "confirmed");
const { intent: i2 } = await post("/api/payments/intent", { kind: "ticket", refId: "s-juno-1" });
const reuse = await post("/api/payments/confirm", { intentId: i2.id, txHash: a.txHash });
const reuseOk = reuse.status === "failed";
if (!reuseOk) failed++;
console.log(`${reuseOk ? "PASS" : "FAIL"}  ${"same tx reused for a 2nd purchase".padEnd(42)} -> ${reuse.status} (${reuse.reason ?? ""})`);

mock.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll payment-verification checks passed.");
process.exit(failed ? 1 : 0);
