// Exercises the real wallet-login route with a locally generated Nimiq key pair.
// It proves the server-side verification (challenge, signature, address derivation, replay
// protection). It cannot prove what digest Nimiq Pay's sign() uses: that needs a device.
// Run with the dev server up:  node scripts/test-login.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Nimiq = require("@nimiq/core");

const base = process.env.BASE ?? "http://localhost:3000";
const enc = new TextEncoder();
const post = async (path, body) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json(), cookie: r.headers.get("set-cookie") };
};
const hex = (u8) => Buffer.from(u8).toString("hex");

const priv = Nimiq.PrivateKey.generate();
const pub = Nimiq.PublicKey.derive(priv);
const address = pub.toAddress().toUserFriendlyAddress();

function sign(message, scheme) {
  const raw = enc.encode(message);
  const prefixed = new Uint8Array([...enc.encode(`\x16Nimiq Signed Message:\n${raw.length}`), ...raw]);
  const data = scheme === "nimiq" ? Nimiq.Hash.computeSha256(prefixed) : scheme === "sha256" ? Nimiq.Hash.computeSha256(raw) : raw;
  return hex(Nimiq.Signature.create(priv, pub, data).serialize());
}

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);
};

for (const scheme of ["nimiq", "sha256", "raw"]) {
  const ch = (await post("/api/auth/challenge", {})).body;
  const res = await post("/api/auth/verify", { nonce: ch.nonce, publicKey: pub.toHex(), signature: sign(ch.message, scheme) });
  const norm = (a) => (a ?? "").replace(/\s/g, "").toUpperCase();
  check(
    `valid signature (${scheme} digest) logs in as derived address`,
    res.status === 200 && norm(res.body.user?.address) === norm(address) && !!res.cookie?.includes("ns_session"),
    `status=${res.status} got=${res.body.user?.address} want=${address} ${res.body.error ?? ""}`,
  );
  const replay = await post("/api/auth/verify", { nonce: ch.nonce, publicKey: pub.toHex(), signature: sign(ch.message, scheme) });
  check(`  replaying that challenge is rejected`, replay.status === 400, replay.body.error ?? "");
}

{
  const ch = (await post("/api/auth/challenge", {})).body;
  const other = Nimiq.PrivateKey.generate();
  const otherPub = Nimiq.PublicKey.derive(other);
  const sigByOther = hex(Nimiq.Signature.create(other, otherPub, enc.encode(ch.message)).serialize());
  const res = await post("/api/auth/verify", { nonce: ch.nonce, publicKey: pub.toHex(), signature: sigByOther });
  check("signature from a different key is rejected", res.status === 401, res.body.error ?? "");
}
{
  const ch = (await post("/api/auth/challenge", {})).body;
  const res = await post("/api/auth/verify", { nonce: ch.nonce, publicKey: pub.toHex(), signature: sign(ch.message + "tampered", "nimiq") });
  check("signature over a different message is rejected", res.status === 401, res.body.error ?? "");
}
{
  const res = await post("/api/auth/verify", { nonce: "0".repeat(32), publicKey: pub.toHex(), signature: "0".repeat(128) });
  check("unknown nonce is rejected", res.status === 400, res.body.error ?? "");
}

// ---- account routes, on a brand-new wallet so nothing shared is touched ----
{
  const wallet = Nimiq.PrivateKey.generate();
  const wpub = Nimiq.PublicKey.derive(wallet);
  const ch = (await post("/api/auth/challenge", {})).body;
  const raw = enc.encode(ch.message);
  const prefixed = new Uint8Array([...enc.encode(`Nimiq Signed Message:
${raw.length}`), ...raw]);
  const sig = hex(Nimiq.Signature.create(wallet, wpub, Nimiq.Hash.computeSha256(prefixed)).serialize());
  const login = await post("/api/auth/verify", { nonce: ch.nonce, publicKey: wpub.toHex(), signature: sig });
  const cookie = login.cookie.split(";")[0];
  check("session: the real wallet login also returns a bearer token", typeof login.body.token === "string" && login.body.token.split(".").length === 3);
  const viaBearer = await (await fetch(base + "/api/me", { headers: { authorization: "Bearer " + login.body.token } })).json();
  check("session: that token alone (no cookie) signs you in", viaBearer.user?.id === login.body.user.id);
  const call = async (path, method = "GET", body) => {
    const r = await fetch(base + path, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null), type: r.headers.get("content-disposition") };
  };
  const anon = (path, method = "GET") => fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" }).then((r) => r.status);

  check("account: signed-out requests are refused", (await anon("/api/me/receipts")) === 401 && (await anon("/api/me/export")) === 401 && (await anon("/api/me", "PATCH")) === 401 && (await anon("/api/me", "DELETE")) === 401);
  const renamed = await call("/api/me", "PATCH", { displayName: "  Test Listener  " });
  const me = await call("/api/me");
  check("account: a display name can be changed (trimmed)", renamed.status === 200 && me.body.user.name === "Test Listener", JSON.stringify(renamed.body));
  check("account: too-short and too-long names are rejected", (await call("/api/me", "PATCH", { displayName: "x" })).status === 400 && (await call("/api/me", "PATCH", { displayName: "y".repeat(31) })).status === 400);
  const receipts = await call("/api/me/receipts");
  check("account: receipts start empty", receipts.status === 200 && Array.isArray(receipts.body.receipts) && receipts.body.receipts.length === 0);
  const exp = await call("/api/me/export");
  check("account: the data export is a download of this account only", exp.status === 200 && /attachment/.test(exp.type ?? "") && exp.body.account.name === "Test Listener" && exp.body.account.id === me.body.user.id);
  check("account: deleting needs the word DELETE", (await call("/api/me", "DELETE", { confirm: "yes" })).status === 400 && (await call("/api/me")).body.user !== null);
  const del = await call("/api/me", "DELETE", { confirm: "DELETE" });
  check("account: deleting works and signs you out", del.status === 200 && (await call("/api/me")).body.user === null);
  // the same wallet signs in again to a fresh, empty account
  const ch2 = (await post("/api/auth/challenge", {})).body;
  const raw2 = enc.encode(ch2.message);
  const pre2 = new Uint8Array([...enc.encode(`Nimiq Signed Message:
${raw2.length}`), ...raw2]);
  const again = await post("/api/auth/verify", { nonce: ch2.nonce, publicKey: wpub.toHex(), signature: hex(Nimiq.Signature.create(wallet, wpub, Nimiq.Hash.computeSha256(pre2)).serialize()) });
  check("account: the wallet can sign up again afterwards, as a new account", again.status === 200 && again.body.user.id !== me.body.user.id && again.body.user.name !== "Test Listener");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll login checks passed.");
process.exit(failed ? 1 : 0);
