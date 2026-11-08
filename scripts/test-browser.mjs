// Browser (no Nimiq Pay) flows against a MOCK Nimiq JSON-RPC node: sign-in by proving an address on-chain,
// and paying by hand from any wallet. It proves our verification rules, not a live node's exact response.
//
// Start the API with a throwaway database and the mock node, e.g.:
//   PGLITE_DIR=.data/test-browser NIMSTAGE_DEMO=1 NIMIQ_RPC_URL=http://localhost:4011 DATABASE_URL= S3_BUCKET= PORT=3011 npx tsx server/index.ts
// then:  BASE=http://localhost:3011 node scripts/test-browser.mjs
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Nimiq = require("@nimiq/core");
const base = process.env.BASE ?? "http://localhost:3011";
const norm = (a) => String(a).replace(/\s+/g, "").toUpperCase();
const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const hash = () => Math.floor(Math.random() * 1e15).toString(16).padStart(64, "0");

let chain = []; // [{hash, from, to, value, recipientData, confirmations, executionResult}]
const mock = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const { params, id, method } = JSON.parse(b);
    res.setHeader("content-type", "application/json");
    if (method === "getTransactionsByAddress") {
      const data = chain.filter((t) => norm(t.to) === norm(params[0]) || norm(t.from) === norm(params[0]));
      return res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { data, metadata: null } }));
    }
    const tx = chain.find((t) => t.hash === params[0]);
    res.end(JSON.stringify(tx ? { jsonrpc: "2.0", id, result: { data: tx, metadata: null } } : { jsonrpc: "2.0", id, error: { code: -32602, message: "not found" } }));
  });
});
await new Promise((r) => mock.listen(4011, r));

const post = async (path, body, auth) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const get = async (path, auth) => (await fetch(base + path, { headers: auth ? { authorization: `Bearer ${auth}` } : {} })).json();

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + extra}`);
};
const newAddress = () => Nimiq.PublicKey.derive(Nimiq.PrivateKey.generate()).toAddress().toUserFriendlyAddress();

/* ---------------- sign in by proving an address ---------------- */
const mine = newAddress();
const other = newAddress();

check("a made-up address is refused", (await post("/api/auth/address/start", { address: "NQ12 not an address at all 1234" })).status === 400);
const start = await post("/api/auth/address/start", { address: mine });
check("a real address gets a code, a memo and one luna to send", start.status === 200 && start.code?.length === 32 && start.memo === `NSL:${start.code}` && start.amountLuna === 1, JSON.stringify(start));

const tx = (over = {}) => ({ hash: hash(), from: mine, to: start.to, value: 1, recipientData: hex(start.memo), confirmations: 2, executionResult: true, ...over });
const ask = () => post("/api/auth/address/check", { code: start.code });

check("nothing sent yet: still pending", (await ask()).status === "pending");
chain.push(tx({ from: other }));
check("someone ELSE sending the same memo does not log you in", (await ask()).status === "pending");
chain.push(tx({ recipientData: hex("NSL:00000000000000000000000000000000") }));
check("the right sender with the wrong memo does not log you in", (await ask()).status === "pending");
chain.push(tx({ to: newAddress() }));
check("the right memo sent to a different address does not log you in", (await ask()).status === "pending");
chain.push(tx({ confirmations: 0 }));
check("not yet confirmed: still pending", (await ask()).status === "pending");
chain.push(tx({ executionResult: false }));
check("a failed transaction does not log you in", (await ask()).status === "pending");

chain.push(tx());
const ok = await ask();
check("the owner's own transaction logs them in", ok.status === "ok" && !!ok.token, JSON.stringify(ok));
const me = await get("/api/me", ok.token);
check("and the account is that address", norm(me.user?.address ?? "") === norm(mine));
check("a code works once (replay refused)", (await ask()).status === 400);

// a challenge made for address-proof can't be redeemed through the signature route
const s2 = await post("/api/auth/address/start", { address: newAddress() });
const sig = await post("/api/auth/verify", { nonce: s2.code, publicKey: "a".repeat(64), signature: "b".repeat(128) });
check("an address-proof code can't be used on the signature route", sig.status === 400);
check("an unknown code is refused", (await post("/api/auth/address/check", { code: "f".repeat(32) })).status === 400);

/* ---------------- paying by hand ---------------- */
const fan = (await post("/api/auth/demo", { persona: "fan" })).token;
const { intent } = await post("/api/payments/intent", { kind: "tip", refId: "a-kofistatic", amountLuna: 100_000 }, fan);
const pay = (over = {}) => ({ hash: hash(), from: mine, to: intent.recipient, value: intent.amountLuna, recipientData: hex(intent.memo), confirmations: 2, executionResult: true, ...over });
const status = async () => (await post("/api/payments/check", { intentId: intent.id }, fan)).status;

check("manual payment: nothing sent yet is pending", (await status()) === "pending");
chain.push(pay({ value: intent.amountLuna - 1 }));
check("manual payment: underpaid is not accepted", (await status()) !== "confirmed");
const intent2 = (await post("/api/payments/intent", { kind: "tip", refId: "a-kofistatic", amountLuna: 100_000 }, fan)).intent;
chain.push({ ...pay(), to: intent2.recipient, value: intent2.amountLuna, recipientData: hex(intent2.memo) });
await new Promise((r) => setTimeout(r, 2700)); // the server throttles recovery per user
check("manual payment: the right transaction confirms by its memo", (await post("/api/payments/check", { intentId: intent2.id }, fan)).status === "confirmed");
check("manual payment: asking again stays confirmed", (await post("/api/payments/check", { intentId: intent2.id }, fan)).status === "confirmed");
check("someone else can't check my payment", (await post("/api/payments/check", { intentId: intent2.id }, ok.token)).status === 404);

mock.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll browser sign-in and manual-payment checks passed.");
process.exit(failed ? 1 : 0);
