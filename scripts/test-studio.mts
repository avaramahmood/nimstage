/* eslint-disable @typescript-eslint/no-explicit-any -- test code reads loosely-typed JSON responses */
// Studio, admin and access-control tests against a running demo-mode server with a fresh database.
//   BASE=http://localhost:3001 npx tsx scripts/test-studio.mts
import assert from "node:assert/strict";
import sharp from "sharp";

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

type Session = { cookie: string; token: string };
const hex = (n = 8) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
async function login(persona: "fan" | "artist" | "admin"): Promise<Session> {
  const r = await fetch(`${base}/api/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona }) });
  assert.equal(r.status, 200, "demo login failed (is NIMSTAGE_DEMO=1?)");
  const body = (await r.json()) as { token: string };
  return { cookie: r.headers.get("set-cookie")!.split(";")[0], token: body.token };
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

// A tiny valid MP3: silent MPEG-1 Layer III frames (128 kbps, 44.1 kHz, 417 bytes, 26 ms each).
function mp3(seconds = 1, type = "audio/mpeg"): Blob {
  const frames = Math.ceil((seconds * 1000) / 26);
  const b = Buffer.alloc(frames * 417);
  for (let i = 0; i < frames; i++) b.set([0xff, 0xfb, 0x90, 0x00], i * 417);
  return new Blob([b], { type });
}
// A tiny valid WAV, which must now be refused: uploads are MP3 only.
function wav(seconds = 1): Blob {
  const sr = 8000, n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return new Blob([b], { type: "audio/wav" });
}
const upload = (as: Session, fields: Record<string, string>, file: Blob | null, name = "t.mp3") => {
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

/* ------------------------------- profile extras ------------------------------- */
await test("profile: tagline, accent and links are saved and validated (https only, at most 4)", async () => {
  const base_ = { name: "Mira Vale", bio: "bio", genre: "Dream pop", payoutAddress: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000", ownsRights: true };
  const save = (extra: object) => call("/api/studio/profile", { body: { ...base_, ...extra }, as: artist });
  assert.equal((await save({ tagline: "x".repeat(81) })).status, 400, "tagline too long");
  assert.equal((await save({ accent: "chartreuse" })).status, 400, "accent must be from the palette");
  assert.equal((await save({ links: [{ label: "Site", url: "http://example.com" }] })).status, 400, "http is refused");
  assert.equal((await save({ links: [{ label: "x", url: "javascript:alert(1)" }] })).status, 400, "javascript: is refused");
  assert.equal((await save({ links: [{ label: "x", url: "data:text/html,hi" }] })).status, 400, "data: is refused");
  assert.equal((await save({ links: [{ label: "x", url: "https://user:pw@example.com/" }] })).status, 400, "credentials in a link are refused");
  assert.equal((await save({ links: [{ label: "", url: "https://example.com" }] })).status, 400, "a link needs a label");
  assert.equal((await save({ links: Array.from({ length: 5 }, (_, i) => ({ label: "L" + i, url: "https://example.com/" + i })) })).status, 400, "five links is too many");
  const ok = await save({ tagline: "Songs from a fourth-floor window", accent: "violet", links: [{ label: "Bandcamp", url: "https://mira.example.com/music" }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const page = (await (await fetch(base + "/api/artists/miravale")).json()) as { artist: { tagline: string; accent: string; links: string } };
  assert.equal(page.artist.tagline, "Songs from a fourth-floor window");
  assert.equal(page.artist.accent, "violet");
  assert.deepEqual(JSON.parse(page.artist.links), [{ label: "Bandcamp", url: "https://mira.example.com/music" }]);
});

/* ------------------------------- artwork ------------------------------- */
const png = (w = 900, h = 600) => sharp({ create: { width: w, height: h, channels: 3, background: "#7a3cff" } }).png().toBuffer();
const putArt = (path: string, bytes: Buffer | Uint8Array, as: Session | null, type = "image/png", name = "art.png") => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return call(path, { method: "PUT", form, as });
};
const imgStatus = async (key: string) => (await fetch(base + "/api/img/" + key)).status;
const gone = async (key: string) => {
  for (let i = 0; i < 30 && (await imgStatus(key)) === 200; i++) await new Promise((r) => setTimeout(r, 100));
  return imgStatus(key);
};
let avatarKey = "";
await test("artwork: an avatar is resized to 512x512 WebP, served publicly with long caching", async () => {
  const r = await putArt("/api/studio/art/avatar/me", await png(), artist);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  avatarKey = r.json.key;
  assert.match(avatarKey, /^[0-9a-f-]{36}\.webp$/);
  const img = await fetch(base + "/api/img/" + avatarKey); // no cookie: artwork is public
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/webp");
  assert.match(img.headers.get("cache-control") ?? "", /immutable/);
  const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 512, 512]);
  const page = (await (await fetch(base + "/api/artists/miravale")).json()) as { artist: { avatarKey: string } };
  assert.equal(page.artist.avatarKey, avatarKey);
});

await test("artwork: banners are cropped to 1200x400; EXIF location data does not survive", async () => {
  const withGps = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#123456" } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } })
    .toBuffer();
  assert.ok((await sharp(withGps).metadata()).exif, "the test image really has EXIF");
  const r = await putArt("/api/studio/art/banner/me", withGps, artist, "image/jpeg", "photo.jpg");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const stored = Buffer.from(await (await fetch(base + "/api/img/" + r.json.key)).arrayBuffer());
  const meta = await sharp(stored).metadata();
  assert.deepEqual([meta.width, meta.height], [1200, 400]);
  assert.equal(meta.exif, undefined, "metadata is stripped");
});

await test("artwork: only real JPEG/PNG/WebP under 5 MB; only artists, only their own things", async () => {
  assert.equal((await putArt("/api/studio/art/avatar/me", Buffer.from("<html><script>alert(1)</script></html>"), artist, "image/png")).status, 400, "HTML renamed to png");
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ffffff" } }).gif().toBuffer();
  assert.equal((await putArt("/api/studio/art/avatar/me", gif, artist, "image/gif", "a.gif")).status, 400, "GIF is not an allowed format");
  assert.equal((await putArt("/api/studio/art/avatar/me", Buffer.alloc(5 * 1024 * 1024 + 1, 1), artist)).status, 400, "over 5 MB");
  assert.equal((await putArt("/api/studio/art/avatar/me", await png(), fan)).status, 403, "a fan is not an artist");
  assert.equal((await putArt("/api/studio/art/avatar/me", await png(), null)).status, 401, "signed out");
  assert.equal((await putArt("/api/studio/art/wallpaper/me", await png(), artist)).status, 404, "unknown kind");
  assert.equal((await putArt("/api/studio/art/track/tr-kofistatic-0", await png(), artist)).status, 404, "another artist's track");
  assert.equal((await putArt("/api/studio/art/show/s-kofi-1", await png(), artist)).status, 404, "another artist's show");
  assert.equal(await imgStatus("..%2f..%2fpackage.json"), 404, "no path tricks");
  assert.equal(await imgStatus("a".repeat(36) + ".webp"), 404, "unknown key");
});

await test("artwork: replacing deletes the old file; removing returns to generated art", async () => {
  const again = await putArt("/api/studio/art/avatar/me", await png(300, 300), artist);
  assert.equal(again.status, 200);
  assert.notEqual(again.json.key, avatarKey);
  assert.equal(await gone(avatarKey), 404, "the replaced image is gone");
  assert.equal((await call("/api/studio/art/avatar/me", { method: "DELETE", as: fan })).status, 403);
  assert.equal((await call("/api/studio/art/avatar/me", { method: "DELETE", as: artist })).status, 200);
  const page = (await (await fetch(base + "/api/artists/miravale")).json()) as { artist: { avatarKey: string | null } };
  assert.equal(page.artist.avatarKey, null);
  assert.equal(await gone(again.json.key), 404);
});

/* ------------------------------- tracks ------------------------------- */
let trackId = "";
await test("tracks: upload works; rights, audio type, size and fields are validated", async () => {
  const valid = { title: "Studio Test", priceNim: "3", previewSec: "10", durationSec: "12", ownsRights: "true" };
  const good = await upload(artist, valid, mp3(12));
  assert.equal(good.status, 200, JSON.stringify(good.json));
  trackId = good.json.id;
  // Each rejection must happen for its *intended* reason, not because some other field was wrong.
  const rejects = async (name: string, r: { status: number; json: any }, why: RegExp) => {
    assert.equal(r.status, 400, `${name}: expected 400, got ${r.status} ${JSON.stringify(r.json)}`);
    assert.match(String(r.json?.error), why, `${name}: rejected for the wrong reason: ${r.json?.error}`);
  };
  await rejects("no rights attestation", await upload(artist, { ...valid, ownsRights: "false" }, mp3()), /own this music/i);
  await rejects("not audio", await upload(artist, valid, new Blob(["not audio"], { type: "text/plain" }), "x.txt"), /Upload an MP3/i);
  await rejects("a WAV is refused: MP3 only", await upload(artist, valid, wav(), "t.wav"), /Upload an MP3/i);
  await rejects("AAC is refused", await upload(artist, valid, new Blob([new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0x00, 0x1f, 0xfc])], { type: "audio/aac" }), "t.aac"), /Upload an MP3/i);
  await rejects("declared MP3 but the bytes are not", await upload(artist, valid, new Blob([Buffer.alloc(4000, 7)], { type: "audio/mpeg" }), "t.mp3"), /valid MP3/i);
  await rejects("a WAV renamed to .mp3 is caught by its content", await upload(artist, valid, new Blob([await wav().arrayBuffer()], { type: "audio/mpeg" }), "t.mp3"), /valid MP3/i);
  await rejects("generic type without a .mp3 name", await upload(artist, valid, mp3(1, "application/octet-stream"), "t.bin"), /Upload an MP3/i);
  assert.equal((await upload(artist, { ...valid, title: "Phone Upload" }, mp3(12, "application/octet-stream"), "phone-recording.MP3")).status, 200, "some phones send no type: a .mp3 name with real MP3 content is accepted");
  assert.equal((await upload(artist, { ...valid, title: "Empty Type Upload" }, mp3(12, ""), "song.mp3")).status, 200, "an empty type is treated the same way");
  await rejects("no file", await upload(artist, valid, null), /choose an audio file/i);
  await rejects("empty title", await upload(artist, { ...valid, title: "" }, mp3()), /too small|title/i);
  await rejects("negative price", await upload(artist, { ...valid, priceNim: "-5" }, mp3()), /too small|>=0|price/i);
  await rejects("duration under 5 s", await upload(artist, { ...valid, durationSec: "1" }, mp3()), /too small|>=5|duration/i);
  assert.equal((await upload(fan, valid, mp3())).status, 403, "fans can't upload");
  const big = new Blob([new Uint8Array(41 * 1024 * 1024)], { type: "audio/mpeg" });
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

await test("artwork: track and show covers can be set on your own items", async () => {
  const t = await putArt("/api/studio/art/track/" + trackId, await png(), artist);
  assert.equal(t.status, 200, JSON.stringify(t.json));
  const sh = await putArt("/api/studio/art/show/" + showId, await png(), artist);
  assert.equal(sh.status, 200, JSON.stringify(sh.json));
  const view = (await (await fetch(base + "/api/shows/" + showId)).json()) as { show: { coverKey: string } };
  assert.equal(view.show.coverKey, sh.json.key);
  const page = await (await fetch(base + "/api/artists/miravale")).text();
  assert.ok(page.includes(t.json.key), "the track cover is part of the public artist page");
  assert.equal((await call("/api/studio/art/track/" + trackId, { method: "DELETE", as: artist })).status, 200);
});

/* ------------------------------- sessions without cookies ------------------------------- */
await test("sessions: a bearer token signs you in without a cookie; audio uses a narrow media token", async () => {
  const bearer = (t: string) => ({ authorization: "Bearer " + t });
  const who = async (t: string) => ((await (await fetch(base + "/api/me", { headers: bearer(t) })).json()) as { user: { role: string } | null }).user;
  assert.equal((await who(fan.token))?.role, "fan", "a session token alone signs you in");
  assert.equal(await who("garbage"), null);
  assert.equal((await fetch(base + "/api/me/media-token")).status, 401, "signed out");
  const mt = ((await (await fetch(base + "/api/me/media-token", { headers: bearer(fan.token) })).json()) as { token: string }).token;
  assert.equal(await who(mt), null, "a media token is not a session");
  // the fan bought a ticket for this show above, so with the right token the audio is the full file
  const access = async (qs: string) => (await fetch(`${base}/api/tracks/${trackId}/stream?show=${showId}${qs}`)).headers.get("x-nimstage-access");
  assert.equal(await access(""), "preview", "no cookie and no token: preview");
  assert.equal(await access("&st=" + mt), "full", "the media token unlocks what the fan owns");
  assert.equal(await access("&st=" + fan.token), "preview", "a session token is not accepted as a media token");
  assert.equal(await access("&st=garbage"), "preview");
  const artistMt = ((await (await fetch(base + "/api/me/media-token", { headers: bearer(artist.token) })).json()) as { token: string }).token;
  assert.equal(await access("&st=" + artistMt), "full", "the artist hears their own track");
});

/* ------------------------------- track page ------------------------------- */
await test("tracks: the track page shows price and access, offers a separate buy, and unlocks after a verified payment", async () => {
  const view = async (id: string, as: Session | null) => call("/api/tracks/" + id, { as });
  const anon = await view("tr-miravale-2", null);
  assert.equal(anon.status, 200);
  assert.equal(anon.json.track.priceLuna, 200_000, "2 NIM");
  assert.equal(anon.json.access, false, "signed out: preview only");
  assert.equal(anon.json.track.mediaKey, undefined, "the storage key of the audio file is never sent");
  assert.equal(anon.json.artist.handle, "miravale");
  assert.equal((await view("tr-miravale-2", fan)).json.access, false);
  assert.equal((await view("tr-miravale-2", artist)).json.access, true, "the artist always has access");
  assert.equal((await view("tr-miravale-2", artist)).json.own, true);
  assert.equal((await view("tr-paperlanterns-1", fan)).json.access, true, "a free track is open to everyone");
  const exclusive = await view("tr-kofistatic-0", fan); // free, but it is the audio of a ticketed show
  assert.equal(exclusive.json.access, false, "show audio is not free just because its own price is 0");
  assert.equal(exclusive.json.exclusiveShow?.id, "s-kofi-1", "the page points at the ticket that unlocks it");
  assert.equal((await view("no-such-track", null)).status, 404);
  // buy it (demo payment), then the same page reports access and the full audio streams
  const { json: i } = await call("/api/payments/intent", { body: { kind: "track", refId: "tr-miravale-2" }, as: fan });
  assert.equal(i.intent.amountLuna, 200_000);
  assert.equal((await call("/api/payments/confirm", { body: { intentId: i.intent.id, txHash: "demo-" + hex(16) }, as: fan })).json.status, "confirmed");
  assert.equal((await view("tr-miravale-2", fan)).json.access, true, "owned after the verified payment");
  assert.equal((await fetch(base + "/api/tracks/tr-miravale-2/stream", { headers: { cookie: fan.cookie } })).headers.get("x-nimstage-access"), "full");
  assert.equal((await view("tr-miravale-2", null)).json.access, false, "still locked for everyone else");
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
  assert.equal((await fetch(`${base}/api/tracks/${trackId}`)).status, 404, "...and its page is gone");
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
