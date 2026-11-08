// Exercises the real wallet-login route with a locally generated Nimiq key pair.
// It proves the server-side verification (challenge, signature, address derivation, replay
// protection). It cannot prove what digest Nimiq Pay's sign() uses: that needs a device.
// Run with the dev server up:  node scripts/test-login.mjs
import { createRequire } from "node:module";
import sharp from "sharp";
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

// ---- usernames and profiles, with real wallets ----
{
  const newWallet = async () => {
    const priv = Nimiq.PrivateKey.generate();
    const pub = Nimiq.PublicKey.derive(priv);
    const ch = (await post("/api/auth/challenge", {})).body;
    const raw = enc.encode(ch.message);
    const pre = new Uint8Array([...enc.encode(`\x16Nimiq Signed Message:\n${raw.length}`), ...raw]);
    const sig = hex(Nimiq.Signature.create(priv, pub, Nimiq.Hash.computeSha256(pre)).serialize());
    const r = await post("/api/auth/verify", { nonce: ch.nonce, publicKey: pub.toHex(), signature: sig });
    const cookie = r.cookie.split(";")[0];
    const call = async (path, method = "GET", body, extra = {}) => {
      const res = await fetch(base + path, { method, headers: { cookie, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}), ...extra }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    return { call, user: r.body.user, address: pub.toAddress().toUserFriendlyAddress() };
  };
  const rnd = () => "zz" + Math.random().toString(36).slice(2, 9);
  const avail = async (u) => (await (await fetch(base + "/api/username/check?u=" + encodeURIComponent(u))).json());

  const a = await newWallet();
  check("username: a brand-new account is not named after its wallet and must choose a username", a.user.needsUsername === true && a.user.username === null && !/^NQ/i.test(a.user.name), JSON.stringify(a.user));
  const names = rnd();
  check("username: the live check rejects bad names for the right reason", (await avail("ab")).reason === "short" && (await avail("1abc")).reason === "start" && (await avail("a-b-c")).reason === "chars" && (await avail("admin")).reason === "reserved" && (await avail("demo_x")).reason === "reserved" && (await avail("x".repeat(21))).reason === "long");
  check("username: names already used as artist pages are taken, ignoring case", (await avail("MiraVale")).reason === "taken");
  check("username: a free name is available", (await avail(names)).available === true);
  check("username: choosing a bad or reserved name is refused", (await a.call("/api/me/username", "PUT", { username: "admin" })).status === 400 && (await a.call("/api/me/username", "PUT", { username: "no" })).status === 400);
  const set = await a.call("/api/me/username", "PUT", { username: names.toUpperCase() });
  const meA = (await a.call("/api/me")).body.user;
  check("username: it is saved lower-case and the setup screen is no longer needed", set.status === 200 && meA.username === names && meA.needsUsername === false, JSON.stringify(set.body));
  const b = await newWallet();
  check("username: another account cannot take it, in any letter case", (await b.call("/api/me/username", "PUT", { username: names })).status === 409 && (await b.call("/api/me/username", "PUT", { username: names.toUpperCase() })).status === 409 && (await avail(names)).reason === "taken");
  check("username: you can still 'choose' your own (no change)", (await a.call("/api/me/username", "PUT", { username: names })).status === 200);

  // profile fields and what the public sees
  const prof = await a.call("/api/me", "PATCH", { displayName: "Test Listener", bio: "I like quiet songs.", accent: "violet", links: [{ label: "Site", url: "https://example.com/me" }], showPass: true });
  const pub = await fetch(base + "/api/users/" + names);
  const pj = await pub.json();
  check("profile: a public profile exists for every account, with what the person chose", prof.status === 200 && pub.status === 200 && pj.user.name === "Test Listener" && pj.user.bio === "I like quiet songs." && pj.user.accent === "violet" && pj.user.links[0].label === "Site" && pj.isMe === false && !!pj.pass, JSON.stringify(pj).slice(0, 160));
  const text = JSON.stringify(pj);
  check("profile: it never exposes the wallet address, account id or purchases", !text.includes(a.address.replace(/\s/g, "")) && !text.includes(a.address) && !text.includes(a.user.id) && !/address|txHash|entitle|receipt/i.test(text), text.slice(0, 200));
  check("profile: the owner is told it is theirs", (await a.call("/api/users/" + names)).body.isMe === true);
  await a.call("/api/me", "PATCH", { showPass: false });
  check("profile: the fan level can be hidden", (await (await fetch(base + "/api/users/" + names)).json()).pass === null);
  check("profile: bad input is refused (bio length, http link, javascript link, unknown accent, empty patch)",
    (await a.call("/api/me", "PATCH", { bio: "x".repeat(161) })).status === 400 &&
    (await a.call("/api/me", "PATCH", { links: [{ label: "x", url: "http://example.com" }] })).status === 400 &&
    (await a.call("/api/me", "PATCH", { links: [{ label: "x", url: "javascript:alert(1)" }] })).status === 400 &&
    (await a.call("/api/me", "PATCH", { accent: "chartreuse" })).status === 400 &&
    (await a.call("/api/me", "PATCH", {})).status === 400);
  check("profile: unknown people are a 404, and artists redirect to their artist page", (await fetch(base + "/api/users/no_such_person_here")).status === 404 && (await (await fetch(base + "/api/users/miravale")).json()).artistHandle === "miravale");

  // pictures
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3366ff" } }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([new Uint8Array(png)], "a.png", { type: "image/png" }));
  const up = await a.call("/api/me/art/avatar", "PUT", form);
  const img = up.body?.key ? await fetch(base + "/api/img/" + up.body.key) : null;
  const dims = img ? await sharp(Buffer.from(await img.arrayBuffer())).metadata() : {};
  check("profile: a profile picture is resized to 512x512 WebP and shown on the public profile", up.status === 200 && img?.status === 200 && dims.width === 512 && dims.height === 512 && (await (await fetch(base + "/api/users/" + names)).json()).user.avatarKey === up.body.key);
  const bad = new FormData();
  bad.set("file", new File([Buffer.from("<html></html>")], "a.png", { type: "image/png" }));
  check("profile: a non-image is refused; unknown picture types are 404", (await a.call("/api/me/art/avatar", "PUT", bad)).status === 400 && (await a.call("/api/me/art/wallpaper", "PUT", form)).status === 404);
  check("profile: a picture can be removed", (await a.call("/api/me/art/avatar", "DELETE")).status === 200 && (await (await fetch(base + "/api/users/" + names)).json()).user.avatarKey === null);

  // becoming an artist: the username is the artist page address
  const noName = await newWallet();
  const body = (u) => ({ name: "New Band", bio: "hi", genre: "Folk", payoutAddress: noName.address, ownsRights: true, ...u });
  check("artist: you must choose a username before creating an artist page", (await noName.call("/api/studio/profile", "POST", body())).status === 400);
  const handle = rnd();
  await noName.call("/api/me/username", "PUT", { username: handle });
  const made = await noName.call("/api/studio/profile", "POST", body({ handle: "ignored_handle" }));
  const art = await fetch(base + "/api/artists/" + handle);
  check("artist: the artist page address is the username (a different handle in the request is ignored)", made.status === 200 && made.body.handle === handle && art.status === 200 && (await fetch(base + "/api/artists/ignored_handle")).status === 404, JSON.stringify(made.body));
  const renamed = rnd();
  const ren = await noName.call("/api/me/username", "PUT", { username: renamed });
  check("artist: changing the username moves the artist page with it", ren.status === 200 && (await fetch(base + "/api/artists/" + renamed)).status === 200 && (await fetch(base + "/api/artists/" + handle)).status === 404, JSON.stringify(ren.body));
  check("username: changes are limited to once a week", (await noName.call("/api/me/username", "PUT", { username: rnd() })).status === 429);

  // deleting frees the name
  await a.call("/api/me", "DELETE", { confirm: "DELETE" });
  check("account: deleting frees the username and removes the public profile", (await avail(names)).available === true && (await fetch(base + "/api/users/" + names)).status === 404);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll login checks passed.");
process.exit(failed ? 1 : 0);
