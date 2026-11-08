/* eslint-disable @typescript-eslint/no-explicit-any -- test code reads loosely-typed JSON responses */
// Studio, admin and access-control tests against a running demo-mode server with a fresh database.
//   BASE=http://localhost:3001 npx tsx scripts/test-studio.mts
import assert from "node:assert/strict";

const base = process.env.BASE ?? "http://localhost:3001";
let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${(e as Error).message.split("\n").slice(0, 3).join("\n      ")}`);
  }
}

type Session = { cookie: string };
const hex = (n = 8) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
async function login(persona: "fan" | "artist" | "admin"): Promise<Session> {
  const r = await fetch(`${base}/api/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona }) });
  assert.equal(r.status, 200, "demo login failed (is NIMSTAGE_DEMO=1?)");
  return { cookie: r.headers.get("set-cookie")!.split(";")[0] };
}
async function call(path: string, opts: { method?: string; body?: unknown; as?: Session | null; form?: FormData } = {}) {
  const r = await fetch(base + path, {
    method: opts.method ?? (opts.body === undefined && !opts.form ? "GET" : "POST"),
    headers: { ...(opts.body === undefined ? {} : { "content-type": "application/json" }), ...(opts.as ? { cookie: opts.as.cookie } : {}) },
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    redirect: "manual",
  });
  let json: any = null;
  try {
    json = await r.json();
  } catch {
    /* not json */
  }
  return { status: r.status, json, headers: r.headers };
}

// A tiny valid WAV (0.5 s of silence) to upload.
function wav(seconds = 1): Blob {
  const sr = 8000, n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return new Blob([b], { type: "audio/wav" });
}
const upload = (as: Session, fields: Record<string, string>, file: Blob | null, name = "t.wav") => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file) f.set("file", file, name);
  return call("/api/studio/tracks", { form: f, as });
};

const fan = await login("fan");
const artist = await login("artist");
const admin = await login("admin");

/* ------------------------------- access control ------------------------------- */
await test("access: studio APIs need an artist profile; admin APIs need admin; admin page is hidden", async () => {
  assert.equal((await call("/api/studio/tiers", { body: { name: "X", priceNim: 5 }, as: fan })).status, 403);
  assert.equal((await call("/api/studio/tiers", { body: { name: "X", priceNim: 5 } })).status, 401);
  assert.equal((await call("/api/admin/reports", { body: { id: "x", action: "dismiss" }, as: fan })).status, 403);
  assert.equal((await call("/api/admin/artists", { body: { id: "x" }, as: artist })).status, 403);
  assert.equal((await fetch(`${base}/api/admin`, { headers: { cookie: fan.cookie } })).status, 404);
  assert.equal((await fetch(`${base}/api/admin`, { headers: { cookie: admin.cookie } })).status, 200);
});

/* ------------------------------- gated audio ------------------------------- */
await test("audio: anonymous gets a preview of a paid track and the full file of a free one; Range works", async () => {
  const paid = await fetch(`${base}/api/tracks/tr-miravale-2/stream`);
  assert.equal(paid.headers.get("x-nimstage-access"), "preview");
  const free = await fetch(`${base}/api/tracks/tr-paperlanterns-1/stream`);
  assert.equal(free.headers.get("x-nimstage-access"), "full");
  const total = (await free.arrayBuffer()).byteLength;
  assert.ok((await paid.arrayBuffer()).byteLength < total / 2, "the preview must be much smaller than the full file");
  const r = await fetch(`${base}/api/tracks/tr-paperlanterns-1/stream`, { headers: { Range: "bytes=1000-1999" } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), `bytes 1000-1999/${total}`);
  assert.equal((await r.arrayBuffer()).byteLength, 1000);
  assert.equal((await fetch(`${base}/api/tracks/tr-paperlanterns-1/stream`, { headers: { Range: "bytes=999999999-" } })).status, 416);
});

await test("audio: a free track used by a ticketed show is show-exclusive (regression: it used to bypass the ticket)", async () => {
  const r = await fetch(`${base}/api/tracks/tr-junohex-0/stream?show=s-juno-1`);
  assert.equal(r.headers.get("x-nimstage-access"), "preview");
  const direct = await fetch(`${base}/api/tracks/tr-junohex-0/stream`);
  assert.equal(direct.headers.get("x-nimstage-access"), "preview");
});

/* ------------------------------- profile ------------------------------- */
await test("profile: payout address is checksum-validated; rights attestation is required", async () => {
  const ok = { name: "Mira Vale", bio: "bio", genre: "Dream pop", payoutAddress: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000", ownsRights: true };
  assert.equal((await call("/api/studio/profile", { body: { ...ok, payoutAddress: "NQ99 ABCD EFGH JKLM NPQR STUV XY01 2345 6789" }, as: artist })).status, 400);
  assert.equal((await call("/api/studio/profile", { body: { ...ok, payoutAddress: "NQ00 NOPE" }, as: artist })).status, 400);
  assert.equal((await call("/api/studio/profile", { body: { ...ok, ownsRights: false }, as: artist })).status, 400);
  assert.equal((await call("/api/studio/profile", { body: ok, as: artist })).status, 200);
});

/* ------------------------------- tracks ------------------------------- */
let trackId = "";
await test("tracks: upload works; rights, audio type, size and fields are validated", async () => {
  const valid = { title: "Studio Test", priceNim: "3", previewSec: "10", durationSec: "12", ownsRights: "true" };
  const good = await upload(artist, valid, wav(12));
  assert.equal(good.status, 200, JSON.stringify(good.json));
  trackId = good.json.id;
  // Each rejection must happen for its *intended* reason, not because some other field was wrong.
  const rejects = async (name: string, r: { status: number; json: any }, why: RegExp) => {
    assert.equal(r.status, 400, `${name}: expected 400, got ${r.status} ${JSON.stringify(r.json)}`);
    assert.match(String(r.json?.error), why, `${name}: rejected for the wrong reason: ${r.json?.error}`);
  };
  await rejects("no rights attestation", await upload(artist, { ...valid, ownsRights: "false" }, wav()), /own this music/i);
  await rejects("not audio", await upload(artist, valid, new Blob(["not audio"], { type: "text/plain" }), "x.txt"), /MP3, WAV/i);
  await rejects("no file", await upload(artist, valid, null), /choose an audio file/i);
  await rejects("empty title", await upload(artist, { ...valid, title: "" }, wav()), /too small|title/i);
  await rejects("negative price", await upload(artist, { ...valid, priceNim: "-5" }, wav()), /too small|>=0|price/i);
  await rejects("duration under 5 s", await upload(artist, { ...valid, durationSec: "1" }, wav()), /too small|>=5|duration/i);
  assert.equal((await upload(fan, valid, wav())).status, 403, "fans can't upload");
  const big = new Blob([new Uint8Array(41 * 1024 * 1024)], { type: "audio/wav" });
  await rejects("over 40 MB", await upload(artist, valid, big), /40 MB/i);
});

await test("tracks: the uploaded track streams a preview to a fan and is listed publicly", async () => {
  const r = await fetch(`${base}/api/tracks/${trackId}/stream`, { headers: { cookie: fan.cookie } });
  assert.equal(r.headers.get("x-nimstage-access"), "preview");
  assert.ok((await (await fetch(`${base}/api/artists/miravale`)).text()).includes("Studio Test"));
});

/* ------------------------------- shows ------------------------------- */
let showId = "";
await test("shows: scheduling needs your own track; validation applies", async () => {
  const start = new Date(Date.now() + 3 * 3600_000).toISOString();
  const body = { title: "Studio Show", description: "d", startsAt: start, durationMin: 30, priceNim: 3, trackId };
  const ok = await call("/api/studio/shows", { body, as: artist });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  showId = ok.json.id;
  assert.equal((await call("/api/studio/shows", { body: { ...body, trackId: "tr-kofistatic-0" }, as: artist })).status, 400, "someone else's track");
  assert.equal((await call("/api/studio/shows", { body: { ...body, startsAt: "tomorrow" }, as: artist })).status, 400, "bad date");
  assert.equal((await call("/api/studio/shows", { body: { ...body, durationMin: 1 }, as: artist })).status, 400, "too short");
  assert.equal((await call("/api/studio/shows", { body: { ...body, priceNim: -1 }, as: artist })).status, 400);
  assert.equal((await call("/api/studio/shows", { body: { ...body, priceNim: 5.01 }, as: artist })).status, 400, "above the 5 NIM cap");
  assert.equal((await call("/api/studio/shows", { body: { ...body, priceNim: 5 }, as: artist })).status, 200, "exactly the cap is allowed");
  assert.equal((await call("/api/studio/shows", { body, as: fan })).status, 403);
});

await test("shows: the new show is public, ticketed audio is a preview until a verified payment, then full", async () => {
  assert.equal((await fetch(`${base}/api/shows/${showId}`)).status, 200);
  assert.equal((await fetch(`${base}/api/tracks/${trackId}/stream?show=${showId}`, { headers: { cookie: fan.cookie } })).headers.get("x-nimstage-access"), "preview");
  const { json: i } = await call("/api/payments/intent", { body: { kind: "ticket", refId: showId }, as: fan });
  const c = await call("/api/payments/confirm", { body: { intentId: i.intent.id, txHash: `demo-${hex(16)}` }, as: fan });
  assert.equal(c.json.status, "confirmed");
  assert.equal((await fetch(`${base}/api/tracks/${trackId}/stream?show=${showId}`, { headers: { cookie: fan.cookie } })).headers.get("x-nimstage-access"), "full");
  const earn = await (await fetch(`${base}/api/studio`, { headers: { cookie: artist.cookie } })).text();
  const earnings = (JSON.parse(earn) as { studio: { earnings: { total: number; tickets: number } } }).studio.earnings;
  assert.ok(earnings.total >= 3 * 100_000, `the verified 3 NIM ticket must show up in earnings (got ${earnings.total})`);
  assert.ok(earnings.tickets >= 3 * 100_000);
});

/* ------------------------------- live video ------------------------------- */
const jwtClaims = (t: string) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
const liveShow = (startsInMin: number, priceNim = 2) => call("/api/studio/shows", { body: { title: "Live Video Test", description: "d", startsAt: new Date(Date.now() + startsInMin * 60_000).toISOString(), durationMin: 30, priceNim, kind: "live" }, as: artist });

await test("live video: a live show needs no track; an audio premiere still does", async () => {
  const ok = await liveShow(-5);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const noTrack = await call("/api/studio/shows", { body: { title: "No Track", startsAt: new Date(Date.now() + 3600_000).toISOString(), durationMin: 30, priceNim: 1 }, as: artist });
  assert.equal(noTrack.status, 400, "a premiere without a track is rejected");
});

await test("live video: tokens follow the access rules, and only the artist's can publish", async () => {
  const live = (await liveShow(-5)).json.id as string;
  const t = (as: Session | null) => call(`/api/shows/${live}/live/token`, { method: "POST", body: {}, as });
  const host = await t(artist);
  if (host.status === 503) return console.log("      (LiveKit is not configured on this server: skipped)");
  assert.equal((await t(null)).status, 401, "signed out");
  assert.equal((await t(fan)).status, 403, "no ticket");
  assert.equal(host.status, 200, JSON.stringify(host.json));
  const h = jwtClaims(host.json.token);
  assert.equal(h.video.room, `show-${live}`);
  assert.equal(h.video.canPublish, true, "the artist can publish");
  assert.equal(host.json.role, "host");

  const { json: i } = await call("/api/payments/intent", { body: { kind: "ticket", refId: live }, as: fan });
  assert.equal((await call("/api/payments/confirm", { body: { intentId: i.intent.id, txHash: `demo-${hex(16)}` }, as: fan })).json.status, "confirmed");
  const viewer = await t(fan);
  assert.equal(viewer.status, 200, JSON.stringify(viewer.json));
  const v = jwtClaims(viewer.json.token);
  assert.equal(v.video.canPublish, false, "a ticket holder can only watch");
  assert.equal(v.video.canSubscribe, true);
  assert.equal(viewer.json.role, "viewer");
  assert.notEqual(v.video.canPublishData, true, "viewers cannot send data either");
});

await test("live video: the join window, premieres and ending the stream", async () => {
  const soon = (await liveShow(30)).json.id as string; // 30 min away: past the viewers' 15 min lead, inside the host's hour
  const far = (await liveShow(300)).json.id as string;
  const ended = (await liveShow(-200)).json.id as string;
  const tok = (id: string, as: Session) => call(`/api/shows/${id}/live/token`, { method: "POST", body: {}, as });
  if ((await tok(soon, artist)).status === 503) return console.log("      (LiveKit is not configured on this server: skipped)");
  assert.equal((await tok(soon, artist)).status, 200, "the host can open the room early");
  assert.equal((await tok(far, artist)).status, 409, "too early even for the host");
  assert.equal((await tok(ended, artist)).status, 410, "ended");
  const free = (await liveShow(-5, 0)).json.id as string;
  assert.equal((await tok(free, fan)).status, 200, "a free live show is open to any signed-in viewer");
  assert.equal((await tok(showId, artist)).status, 404, "an audio premiere has no video room");
  assert.equal((await call(`/api/shows/${free}/live/end`, { method: "POST", body: {}, as: fan })).status, 403, "only the artist can end it");
  assert.equal((await call(`/api/shows/${free}/live/end`, { method: "POST", body: {}, as: artist })).status, 200);
});

/* ------------------------------- tiers & posts ------------------------------- */
await test("tiers: at most three; only the owner can delete; the test cleans up after itself", async () => {
  const add = (name: string) => call("/api/studio/tiers", { body: { name, perks: "p", priceNim: 3 }, as: artist });
  const extra = await add("Extra"); // the demo artist starts with two tiers, so this is the third
  assert.equal(extra.status, 200, `adding a third tier failed (${JSON.stringify(extra.json)}); run against a fresh database`);
  assert.ok((await (await fetch(`${base}/api/artists/miravale`)).text()).includes("Extra"));
  const over = await add("Too many");
  assert.equal(over.status, 400);
  assert.match(over.json.error, /three/i);
  assert.equal((await call("/api/studio/tiers", { method: "DELETE", body: { id: extra.json.id }, as: fan })).status, 403, "a fan can't delete tiers");
  assert.equal((await call("/api/studio/tiers", { method: "DELETE", body: { id: "t-kofistatic-1" }, as: artist })).status, 404, "can't delete another artist's tier");
  assert.equal((await call("/api/studio/tiers", { method: "DELETE", body: { id: extra.json.id }, as: artist })).status, 200);
  assert.ok(!(await (await fetch(`${base}/api/artists/miravale`)).text()).includes("Extra"));
});

await test("posts: supporter-only text is never sent to a non-supporter", async () => {
  const secret = `secret-${hex(6)}`;
  const tiers = await (await fetch(`${base}/api/artists/miravale`)).text();
  const tierId = /t-miravale-1/.exec(tiers) ? "t-miravale-1" : null;
  assert.ok(tierId);
  const made = await call("/api/studio/posts", { body: { body: secret, tierId }, as: artist });
  assert.equal(made.status, 200);
  const asFan = await (await fetch(`${base}/api/artists/miravale`, { headers: { cookie: fan.cookie } })).text();
  assert.ok(!asFan.includes(secret), "locked post body leaked to a non-supporter");
  const asAnon = await (await fetch(`${base}/api/artists/miravale`)).text();
  assert.ok(!asAnon.includes(secret), "locked post body leaked to an anonymous visitor");
  const asOwner = await (await fetch(`${base}/api/artists/miravale`, { headers: { cookie: artist.cookie } })).text();
  assert.ok(asOwner.includes(secret), "the artist must see their own post");
  assert.equal((await call("/api/studio/posts", { body: { body: "x", tierId: "t-kofistatic-1" }, as: artist })).status, 400, "can't gate on another artist's tier");
});

/* ------------------------------- reports & admin ------------------------------- */
await test("moderation: a report can be dismissed or actioned; a takedown removes the track", async () => {
  assert.equal((await call("/api/reports", { body: { targetKind: "track", targetId: trackId, reason: "copyright" } })).status, 401, "must be signed in to report");
  assert.equal((await call("/api/reports", { body: { targetKind: "track", targetId: trackId, reason: "nonsense" }, as: fan })).status, 400);
  assert.equal((await call("/api/reports", { body: { targetKind: "track", targetId: trackId, reason: "copyright", note: "this is mine" }, as: fan })).status, 200);
  const list = (await call("/api/admin/reports", { as: admin })).json.reports as { id: string; targetId: string }[];
  const rep = list.find((r) => r.targetId === trackId);
  assert.ok(rep, "report visible to admin");
  assert.equal((await call("/api/admin/reports", { body: { id: rep!.id, action: "takedown" }, as: admin })).status, 200);
  assert.equal((await fetch(`${base}/api/tracks/${trackId}/stream`)).status, 404, "taken-down track no longer streams");
  assert.ok(!(await (await fetch(`${base}/api/artists/miravale`)).text()).includes("Studio Test"), "title must not leak via the artist view");
  const showView = await (await fetch(`${base}/api/shows/${showId}`)).text();
  assert.ok(!showView.includes("Studio Test"), "title must not leak via the show view");
  assert.equal(JSON.parse(showView).track, null, "the show must not offer a taken-down track to the player");
  assert.equal((await call("/api/admin/reports", { body: { id: "nope", action: "dismiss" }, as: admin })).status, 404);
});

await test("moderation: suspending an artist hides them everywhere, reinstating restores them", async () => {
  assert.equal((await call("/api/admin/artists", { body: { id: "a-sablerook", suspended: true }, as: admin })).status, 200);
  assert.equal((await fetch(`${base}/api/artists/sablerook`)).status, 404);
  assert.ok(!(await (await fetch(`${base}/api/home`)).text()).includes("Sable Rook"));
  assert.equal((await call("/api/admin/artists", { body: { id: "a-sablerook", suspended: false }, as: admin })).status, 200);
  assert.equal((await fetch(`${base}/api/artists/sablerook`)).status, 200);
});

/* ------------------------------- payments guard rails ------------------------------- */
await test("payments: tips are bounded; you can't pay yourself; free shows have no ticket; sign-in is required", async () => {
  assert.equal((await call("/api/payments/intent", { body: { kind: "tip", refId: "a-kofistatic", amountLuna: 1 }, as: fan })).status, 400, "below minimum");
  assert.equal((await call("/api/payments/intent", { body: { kind: "tip", refId: "a-kofistatic", amountLuna: 500_001 }, as: fan })).status, 400, "just above the 5 NIM cap");
  assert.equal((await call("/api/payments/intent", { body: { kind: "tip", refId: "a-kofistatic", amountLuna: 500_000 }, as: fan })).status, 200, "exactly the cap is allowed");
  assert.equal((await call("/api/payments/intent", { body: { kind: "tip", refId: "a-miravale", amountLuna: 500_000 }, as: artist })).status, 400, "own artist");
  assert.equal((await call("/api/payments/intent", { body: { kind: "ticket", refId: "s-lantern-1" }, as: fan })).status, 400, "free shows have no ticket");
  assert.equal((await call("/api/payments/intent", { body: { kind: "ticket" }, as: fan })).status, 404);
  assert.equal((await call("/api/payments/intent", { body: { kind: "ticket", refId: "s-kofi-1" } })).status, 401);
});

console.log(failures.length ? `\n${failures.length} failed, ${passed} passed` : `\nAll ${passed} studio/admin tests passed.`);
process.exit(failures.length ? 1 : 0);
