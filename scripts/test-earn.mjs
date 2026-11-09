// Earn: the validator list and a staker's position, against MOCK services (a validators API and a Nimiq node).
//   PGLITE_DIR=.data/test-earn NIMSTAGE_DEMO=1 DATABASE_URL= S3_BUCKET= PORT=3013 \
//   VALIDATORS_API_URL=http://localhost:4020/validators NIMIQ_RPC_URL=http://localhost:4021 npx tsx server/index.ts
//   BASE=http://localhost:3013 node scripts/test-earn.mjs
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Nimiq = require("@nimiq/core");
const base = process.env.BASE ?? "http://localhost:3013";
const mkAddr = () => Nimiq.PublicKey.derive(Nimiq.PrivateKey.generate()).toAddress().toUserFriendlyAddress();
const staker = mkAddr();
const nobody = mkAddr();
const bareShape = mkAddr(); // a node that answers without the `data` wrapper
const stringy = mkAddr(); // a node that answers with numeric strings
const v1 = mkAddr();
const v2 = mkAddr();
const v3 = mkAddr();

const bigLogo = "data:image/svg+xml;base64," + "A".repeat(200_000);
const validators = [
  { id: 1, name: "Low Score Pool", address: v1, description: "x".repeat(400), fee: 0.05, payoutType: "restake", payoutSchedule: "Every 12 hours", website: "https://low.example", isListed: true, score: { total: 0.4 }, logo: bigLogo, stakers: 10 },
  { id: 2, name: "Best Pool", address: v2, description: null, fee: 0.03, payoutType: "direct", payoutSchedule: "Every 3 hours", website: "javascript:alert(1)", isListed: true, score: { total: 0.99 }, logo: bigLogo, stakers: 200 },
  { id: 3, name: "Hidden Pool", address: v3, fee: 0.01, payoutType: "restake", payoutSchedule: "", isListed: false, score: { total: 1 }, logo: bigLogo },
  { id: 4, name: "Odd Payout", address: mkAddr(), fee: 7, payoutType: "bitcoin", isListed: true, score: null },
];

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};
const vApi = http.createServer((req, res) => send(res, 200, validators));
const node = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const { method, params, id } = JSON.parse(b);
    if (method !== "getStakerByAddress") return send(res, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    const is = (a) => params[0].replace(/\s/g, "") === a.replace(/\s/g, "");
    if (is(bareShape)) return send(res, 200, { jsonrpc: "2.0", id, result: { address: bareShape, balance: 12_300_000, delegation: v2 } });
    if (is(stringy)) return send(res, 200, { jsonrpc: "2.0", id, result: { data: { address: stringy, balance: "9900000", inactiveBalance: "-4", retiredBalance: "250000", delegation: v1 } } });
    if (is(staker)) return send(res, 200, { jsonrpc: "2.0", id, result: { data: { address: staker, balance: 25_000_000, inactiveBalance: 100_000, retiredBalance: 0, delegation: v2 }, metadata: null } });
    send(res, 200, { jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error", data: `No staker with address: ${params[0]}` } });
  });
});
await new Promise((r) => vApi.listen(4020, r));
await new Promise((r) => node.listen(4021, r));

const get = async (path) => {
  const r = await fetch(base + path);
  return { status: r.status, size: Number(r.headers.get("content-length") ?? 0), ...(await r.json().catch(() => ({}))) };
};
let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + extra}`);
};

const list = await get("/api/earn/validators");
const names = (list.validators ?? []).map((v) => v.name);
check("the validator list loads", list.status === 200 && names.length > 0, JSON.stringify(list).slice(0, 200));
check("unlisted validators are left out", !names.includes("Hidden Pool"));
check("best score comes first", names[0] === "Best Pool", names.join(","));
check("logos are stripped (the official list is over a megabyte)", !JSON.stringify(list).includes("base64") && JSON.stringify(list).length < 5_000);
check("long descriptions are cut", (list.validators.find((v) => v.name === "Low Score Pool")?.description ?? "").length <= 240);
check("a non-https website is dropped", list.validators.find((v) => v.name === "Best Pool")?.website === null);
check("an unknown payout type becomes 'none' and a silly fee becomes 0", (() => { const o = list.validators.find((v) => v.name === "Odd Payout"); return o?.payoutType === "none" && o?.fee === 0 && o?.score === 0; })());

const pos = await get(`/api/earn/position?address=${encodeURIComponent(staker)}`);
check("a staker's position is read from the node", pos.available === true && pos.staker?.balance === 25_000_000 && pos.staker?.inactiveBalance === 100_000 && pos.staker?.delegation === v2, JSON.stringify(pos));
check("an address that never staked is 'no staker', not an error", (await get(`/api/earn/position?address=${encodeURIComponent(nobody)}`)).staker === null);
check("a made-up address is refused", (await get("/api/earn/position?address=NQ12%20nope")).status === 400);
check("a missing address is refused", (await get("/api/earn/position")).status === 400);

check("a node that answers without the data wrapper still works", (await get(`/api/earn/position?address=${encodeURIComponent(bareShape)}`)).staker?.balance === 12_300_000);
const s2 = (await get(`/api/earn/position?address=${encodeURIComponent(stringy)}`)).staker;
check("numeric strings are read, and a negative number counts as zero", s2?.balance === 9_900_000 && s2?.inactiveBalance === 0 && s2?.retiredBalance === 250_000, JSON.stringify(s2));
check("a lower-case address with no spaces is accepted", (await get(`/api/earn/position?address=${encodeURIComponent(staker.replace(/\s/g, "").toLowerCase())}`)).staker?.balance === 25_000_000);

// things going wrong upstream must never become a server error
vApi.close();
const cached = await get("/api/earn/validators");
check("if the official list goes down, the last good list is still served", cached.status === 200 && cached.validators?.length === list.validators.length);
node.close();
const down = await get(`/api/earn/position?address=${encodeURIComponent(staker)}`);
check("if the node goes down: 200 with available=false, never a 500", down.status === 200 && down.available === false && down.staker === null, JSON.stringify(down));

if (process.env.BASE_DEAD) {
  // a second server whose validator list was never reachable
  const r = await fetch(process.env.BASE_DEAD + "/api/earn/validators");
  check("with no list ever loaded and the source down: a clear 503, not a 500", r.status === 503 && /unavailable/i.test((await r.json()).error ?? ""), String(r.status));
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll Earn checks passed.");
process.exit(failed ? 1 : 0);
