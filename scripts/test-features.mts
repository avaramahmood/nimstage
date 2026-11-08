/* eslint-disable @typescript-eslint/no-explicit-any -- test code reads loosely-typed JSON responses */
// End-to-end API tests for the interactive features, against a running server in demo mode
// (NIMSTAGE_DEMO=1, NIMSTAGE_DEMO_PAYMENTS=1) with a freshly seeded database.
//   BASE=http://localhost:3001 npx tsx scripts/test-features.ts
import assert from "node:assert/strict";
import { computePass, type Pass } from "../shared/fanpass";

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
  assert.equal(r.status, 200, `demo login ${persona} failed (is NIMSTAGE_DEMO=1?)`);
  return { cookie: r.headers.get("set-cookie")!.split(";")[0] };
}

async function call(path: string, opts: { method?: string; body?: unknown; as?: Session | null; headers?: Record<string, string> } = {}) {
  const r = await fetch(base + path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { ...(opts.body === undefined ? {} : { "content-type": "application/json" }), ...(opts.as ? { cookie: opts.as.cookie } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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

async function buy(as: Session, kind: "ticket" | "membership" | "tip", refId: string, amountLuna?: number) {
  const { json: i, status } = await call("/api/payments/intent", { body: { kind, refId, amountLuna }, as });
  assert.equal(status, 200, `intent failed: ${JSON.stringify(i)}`);
  const c = await call("/api/payments/confirm", { body: { intentId: i.intent.id, txHash: `demo-${hex(16)}` }, as });
  assert.equal(c.json.status, "confirmed", `confirm failed: ${JSON.stringify(c.json)}`);
}

const fan = await login("fan");
const artist = await login("artist"); // Mira Vale
const second = await login("admin"); // used as a second, independent fan

// find the always-on live demo show from the home page
const home = await (await fetch(base + "/api/home")).text(); // JSON
const liveId = (JSON.parse(home) as { live: { id: string }[] }).live[0]?.id ?? "s-kofi-1";

/* ------------------------------- live room ------------------------------- */
await test("live room: one poll returns messages, reaction totals and a presence count", async () => {
  const r = await call(`/api/shows/${liveId}/chat?cid=${hex()}`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.messages));
  assert.equal(typeof r.json.here, "number");
  for (const e of ["🔥", "❤️", "👏", "🎸"]) assert.equal(typeof r.json.reactions[e], "number", `missing ${e}`);
});

await test("presence: each new client counts once; repeats don't double count; invalid ids are ignored", async () => {
  const a = hex(), b = hex();
  const h1 = (await call(`/api/shows/${liveId}/chat?cid=${a}`)).json.here;
  const h1again = (await call(`/api/shows/${liveId}/chat?cid=${a}`)).json.here;
  assert.equal(h1again, h1, "same client must not be counted twice");
  const h2 = (await call(`/api/shows/${liveId}/chat?cid=${b}`)).json.here;
  assert.equal(h2, h1 + 1, "a second client adds exactly one");
  const bad = (await call(`/api/shows/${liveId}/chat?cid=NOT%20VALID!!`)).json.here;
  assert.equal(bad, h2, "an invalid id must not be counted");
  const none = (await call(`/api/shows/${liveId}/chat`)).json.here;
  assert.equal(none, h2, "reading without an id must not be counted");
});

/* ------------------------------- chat gating ------------------------------- */
await test("chat: anonymous 401, signed-in without a ticket 403", async () => {
  assert.equal((await call("/api/shows/s-kofi-1/chat", { body: { body: "hi" } })).status, 401);
  const r = await call("/api/shows/s-kofi-1/chat", { body: { body: "hi" }, as: fan });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /ticket/i);
});

/* ------------------------------- fan pass ------------------------------- */
let before: Pass;
await test("fan pass: endpoint requires sign-in and returns a self-consistent pass", async () => {
  assert.equal((await call("/api/me/pass")).status, 401);
  const r = await call("/api/me/pass", { as: fan });
  assert.equal(r.status, 200);
  before = r.json.pass as Pass;
  const recomputed = computePass(before.stats);
  assert.equal(before.xp, recomputed.xp, "server XP must match the shared formula");
  assert.equal(before.levelName, recomputed.levelName);
});

await test("fan pass: buying a ticket and chatting move the stats and XP, and unlock First Ticket", async () => {
  await buy(fan, "ticket", "s-kofi-1");
  const sent = await call("/api/shows/s-kofi-1/chat", { body: { body: `test message ${hex(4)}` }, as: fan });
  assert.equal(sent.status, 200, "ticket holders can chat");
  const feed = await call(`/api/shows/s-kofi-1/chat?cid=${hex()}`);
  assert.ok(feed.json.messages.some((m: any) => /test message/.test(m.body)), "message appears in the live feed");
  const after = (await call("/api/me/pass", { as: fan })).json.pass as Pass;
  assert.ok(after.stats.tickets >= 1, "ticket counted");
  assert.ok(after.stats.messages >= before.stats.messages + 1, "message counted");
  assert.ok(after.xp > before.xp, `XP must rise (was ${before.xp}, now ${after.xp})`);
  assert.ok(after.badges.find((b) => b.id === "first-ticket")?.unlocked, "First Ticket badge unlocked");
});

/* ------------------------------- polls ------------------------------- */
const KOFI = "poll-kofi-1";
const opts = (n: number) => `${KOFI}-o${n}`;
const counts = (poll: any) => Object.fromEntries(poll.options.map((o: any) => [o.id, o.votes]));

await test("polls: voting needs sign-in; unknown poll 404; foreign option 400", async () => {
  assert.equal((await call(`/api/polls/${KOFI}/vote`, { body: { optionId: opts(0) } })).status, 401);
  assert.equal((await call("/api/polls/nope/vote", { body: { optionId: "x" }, as: fan })).status, 404);
  assert.equal((await call(`/api/polls/${KOFI}/vote`, { body: { optionId: "poll-mira-1-o0" }, as: fan })).status, 400);
});

await test("polls: a vote counts once, repeating is idempotent, changing moves exactly one vote", async () => {
  const start = (await call(`/api/polls/${KOFI}`, { as: second })).json.poll;
  assert.equal((await call(`/api/polls/${KOFI}/vote`, { body: { optionId: opts(0) }, as: fan })).status, 200);
  const a = (await call(`/api/polls/${KOFI}`, { as: fan })).json.poll;
  assert.equal(a.myVote, opts(0));
  assert.equal(a.total, start.total + 1);
  assert.equal(counts(a)[opts(0)], counts(start)[opts(0)] + 1);

  await call(`/api/polls/${KOFI}/vote`, { body: { optionId: opts(0) }, as: fan }); // same again
  const b = (await call(`/api/polls/${KOFI}`, { as: fan })).json.poll;
  assert.equal(b.total, a.total, "re-voting the same option must not add a vote");

  await call(`/api/polls/${KOFI}/vote`, { body: { optionId: opts(1) }, as: fan }); // change
  const c = (await call(`/api/polls/${KOFI}`, { as: fan })).json.poll;
  assert.equal(c.total, a.total, "changing a vote must not add a vote");
  assert.equal(counts(c)[opts(0)], counts(a)[opts(0)] - 1);
  assert.equal(counts(c)[opts(1)], counts(a)[opts(1)] + 1);
  assert.equal(c.options.reduce((n: number, o: any) => n + o.votes, 0), c.total, "option votes must add up to the total");
});

await test("polls: results are visible to everyone, but only a signed-in viewer sees their own vote", async () => {
  const anon = (await call(`/api/polls/${KOFI}`)).json.poll;
  assert.equal(anon.myVote, null);
  assert.equal(anon.canVote, false);
  assert.match(anon.reason, /sign in/i);
});

await test("polls: tier-gated poll rejects non-supporters, a lower tier, and the artist; accepts the right tier", async () => {
  const MIRA = "poll-mira-1";
  const vote = (as: Session) => call(`/api/polls/${MIRA}/vote`, { body: { optionId: `${MIRA}-o0` }, as });
  const nofan = await vote(second);
  assert.equal(nofan.status, 403);
  assert.match(nofan.json.error, /supporters/i);
  assert.equal((await vote(artist)).status, 403, "artists can't vote on their own poll");

  await buy(second, "membership", "t-miravale-1"); // Front Row: cheaper than Backstage
  assert.equal((await vote(second)).status, 403, "a lower tier is not enough");

  await buy(second, "membership", "t-miravale-2"); // Backstage
  assert.equal((await vote(second)).status, 200, "the required tier can vote");
  const p = (await call(`/api/polls/${MIRA}`, { as: second })).json.poll;
  assert.equal(p.myVote, `${MIRA}-o0`);
  assert.equal(p.canVote, true);
});

let createdPoll = "";
await test("studio polls: artists can create; validation and ownership are enforced", async () => {
  const good = await call("/api/studio/polls", { body: { question: "Encore song?", options: ["Window Seat", "Soft Static"], tierId: null }, as: artist });
  assert.equal(good.status, 200, JSON.stringify(good.json));
  createdPoll = good.json.id;
  const bad = (body: unknown, as: Session = artist) => call("/api/studio/polls", { body, as });
  assert.equal((await bad({ question: "Encore song?", options: ["Only one"] })).status, 400, "needs 2+ options");
  assert.equal((await bad({ question: "Encore song?", options: ["Same", "Same"] })).status, 400, "options must differ");
  assert.equal((await bad({ question: "Encore song?", options: ["1", "2", "3", "4", "5", "6"] })).status, 400, "max 5 options");
  assert.equal((await bad({ question: "Hey", options: ["a", "b"] })).status, 400, "question too short");
  assert.equal((await bad({ question: "Encore song?", options: ["a", "b"], tierId: "t-kofistatic-1" })).status, 400, "can't gate on another artist's tier");
  assert.equal((await bad({ question: "Encore song?", options: ["a", "b"] }, fan)).status, 403, "a fan with no artist profile can't create");
  assert.equal((await bad({ question: "Encore song?", options: ["a", "b"] }, second)).status, 403);
});

await test("studio polls: shows on the artist's dashboard, can be closed once, and a closed poll rejects votes but keeps results", async () => {
  const studio = await (await fetch(base + "/api/studio", { headers: { cookie: artist.cookie } })).text();
  assert.ok(studio.includes("Encore song?"), "poll listed in the studio");

  const optionId = (await call(`/api/polls/${createdPoll}`, { as: fan })).json.poll.options[0].id;
  assert.equal((await call(`/api/polls/${createdPoll}/vote`, { body: { optionId }, as: fan })).status, 200, "open poll accepts votes");

  assert.equal((await call("/api/studio/polls", { method: "PATCH", body: { id: createdPoll }, as: fan })).status, 403, "a fan can't close it");
  assert.equal((await call("/api/studio/polls", { method: "PATCH", body: { id: createdPoll }, as: artist })).status, 200);
  assert.equal((await call("/api/studio/polls", { method: "PATCH", body: { id: createdPoll }, as: artist })).status, 404, "already closed");

  const closed = await call(`/api/polls/${createdPoll}/vote`, { body: { optionId }, as: second });
  assert.equal(closed.status, 403);
  assert.match(closed.json.error, /closed/i);
  const view = (await call(`/api/polls/${createdPoll}`, { as: fan })).json.poll;
  assert.equal(view.status, "closed");
  assert.equal(view.total, 1, "results are kept");
});

await test("studio polls: removing hides the poll everywhere; only the owner can remove", async () => {
  assert.equal((await call("/api/studio/remove", { body: { kind: "poll", id: createdPoll }, as: second })).status, 403);
  assert.equal((await call("/api/studio/remove", { body: { kind: "poll", id: createdPoll }, as: artist })).status, 200);
  assert.equal((await call(`/api/polls/${createdPoll}`, { as: fan })).status, 404);
});

await test("fan pass: voting unlocks the Voice badge", async () => {
  const pass = (await call("/api/me/pass", { as: fan })).json.pass as Pass;
  assert.ok(pass.stats.votes >= 1);
  assert.ok(pass.badges.find((b) => b.id === "voice")?.unlocked);
});

/* ------------------------------- surprise me ------------------------------- */
await test("surprise me: returns the handle of a real artist, and varies", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const r = await call("/api/surprise");
    assert.equal(r.status, 200);
    assert.match(r.json.handle, /^[a-z0-9_]+$/);
    assert.equal((await call(`/api/artists/${r.json.handle}`)).status, 200, `${r.json.handle} should exist`);
    seen.add(r.json.handle);
  }
  assert.ok(seen.size >= 2, "should vary between artists");
});

/* ------------------------------- page data (the JSON the SPA renders) ------------------------------- */
await test("page data: show view reports access and chat rights; artist view carries polls; library needs sign-in", async () => {
  const show = (await call("/api/shows/s-kofi-1")).json;
  assert.equal(show.show.title, "Garage Sun: Release Night");
  assert.equal(show.access, false, "an anonymous visitor has no access to a ticketed show");
  assert.equal(show.canChat, false);
  const ticketed = (await call("/api/shows/s-kofi-1", { as: fan })).json; // bought earlier in this run
  assert.equal(ticketed.access, true);
  assert.equal(ticketed.canChat, true);
  assert.equal((await call("/api/shows/no-such-show")).status, 404);

  const artistView = (await call("/api/artists/kofistatic")).json;
  assert.ok(artistView.polls.some((p: any) => p.question === "Which song should open Release Night?"), "poll is in the artist view");
  assert.equal((await call("/api/artists/no-such-artist")).status, 404);

  assert.equal((await call("/api/library")).status, 401);
  const lib = await call("/api/library", { as: fan });
  assert.equal(lib.status, 200);
  assert.ok(lib.json.shows.some((s: any) => s.id === "s-kofi-1"), "the bought ticket is in the library");
});

await test("page data: a tier-gated poll is visible to a non-supporter but not votable, with the reason", async () => {
  const view = (await call("/api/artists/miravale", { as: fan })).json;
  const poll = view.polls.find((p: any) => p.question === "What should I play in the next listening room?");
  assert.ok(poll, "the poll is listed");
  assert.equal(poll.canVote, false);
  assert.match(poll.reason, /Supporters at/);
});

await test("page data: home lists the live demo show and the lineup", async () => {
  const h = (await call("/api/home")).json;
  assert.ok(h.live.length >= 1, "an always-on live show exists");
  assert.ok(h.lineup.length >= 5);
  assert.ok(h.recent.length >= 1);
});

/* ------------------------------- reactions (last: it trips the rate limiter on purpose) ------------------------------- */
await test("reactions: anyone can react; totals rise by exactly the amount sent", async () => {
  const before = (await call(`/api/shows/${liveId}/chat`)).json.reactions;
  assert.equal((await call(`/api/shows/${liveId}/reactions`, { body: { emoji: "🔥", n: 3 } })).status, 200);
  assert.equal((await call(`/api/shows/${liveId}/reactions`, { body: { emoji: "🎸" } })).status, 200, "n defaults to 1");
  const after = (await call(`/api/shows/${liveId}/chat`)).json.reactions;
  assert.equal(after["🔥"], before["🔥"] + 3);
  assert.equal(after["🎸"], before["🎸"] + 1);
  assert.equal(after["❤️"], before["❤️"], "other emoji untouched");
});

await test("reactions: invalid emoji, bad counts and unknown shows are rejected", async () => {
  const post = (body: unknown, id = liveId) => call(`/api/shows/${id}/reactions`, { body });
  assert.equal((await post({ emoji: "💩" })).status, 400);
  assert.equal((await post({ emoji: "🔥", n: 0 })).status, 400);
  assert.equal((await post({ emoji: "🔥", n: 13 })).status, 400, "a single request can't inflate by more than 12");
  assert.equal((await post({ emoji: "🔥", n: 1.5 })).status, 400);
  assert.equal((await post({ emoji: "🔥", n: "5" })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ emoji: "🔥" }, "no-such-show")).status, 404);
});

await test("reactions: flooding is rate limited", async () => {
  let limited = 0;
  for (let i = 0; i < 70; i++) {
    const r = await call(`/api/shows/${liveId}/reactions`, { body: { emoji: "👏" } });
    if (r.status === 429) limited++;
  }
  assert.ok(limited > 0, "expected at least one 429 after a burst of 70");
});

console.log(failures.length ? `\n${failures.length} failed, ${passed} passed` : `\nAll ${passed} feature tests passed.`);
process.exit(failures.length ? 1 : 0);
