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
    const { params, id, method } = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    if (method === "getTransactionsByAddress") {
      const norm = (a) => String(a).replace(/\s/g, "").toUpperCase();
      const data = Object.entries(scenario)
        .filter(([, t]) => norm(t.to) === norm(params[0]))
        .map(([hash, t]) => ({ hash, ...t }));
      return res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { data, metadata: null } }));
    }
    const tx = scenario[params[0]];
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

// ---- recovery: payments the app never heard back about ----
// The customer paid on-chain but the app froze or closed before it learned the transaction hash. The server finds
// the payment by its memo among the artist's recent incoming transactions, with exactly the same checks.
{
  const get = async (path) => (await fetch(base + path, { headers: { cookie } })).json();
  const mk = async () => (await post("/api/payments/intent", { kind: "tip", refId: "a-kofistatic", amountLuna: 100_000 })).intent;
  const [ok, under, other, elsewhere] = [await mk(), await mk(), await mk(), await mk()];
  const tx = (i, over = {}) => ({ to: i.recipient, value: i.amountLuna, recipientData: hex(i.memo), confirmations: 3, executionResult: true, blockNumber: 100, ...over });
  const h = () => hash(Math.floor(Math.random() * 1e12));
  scenario[h()] = tx(ok);
  scenario[h()] = tx(under, { value: under.amountLuna - 1 });
  scenario[h()] = tx(other, { recipientData: hex("NS:someoneelse1") });
  scenario[h()] = tx(elsewhere, { to: "NQ07 0000 0000 0000 0000 0000 0000 0000 0001" });
  const receipts = (await get("/api/me/receipts")).receipts; // opening receipts triggers the recovery
  const row = (i) => receipts.find((r) => r.id === i.id);
  const check2 = (name, pass) => {
    if (!pass) failed++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  };
  check2("recovered: a payment with no hash recorded is found by its memo and confirmed", row(ok)?.status === "confirmed" && !!row(ok)?.txHash);
  check2("recovered: an underpaid one is refused, so it is not listed as paid", !row(under));
  check2("recovered: a transaction with someone else's memo does not settle this payment", row(other)?.status === "pending");
  check2("recovered: a payment sent to a different address is not matched", row(elsewhere)?.status === "pending");
  const again = (await get("/api/me/receipts")).receipts;
  check2("recovered: doing it again changes nothing (no double confirmation)", again.filter((r) => r.status === "confirmed").length === receipts.filter((r) => r.status === "confirmed").length);
}

mock.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll payment-verification checks passed.");
process.exit(failed ? 1 : 0);
