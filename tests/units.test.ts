// Unit tests for the pure logic (no server needed).  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "vitest";
import { computePass, LEVELS, xpFor } from "@shared/fanpass";
import { buildIcs, googleCalendarUrl, icsDate, icsEscape } from "@shared/calendar";
import { coverColors, coverStyle, fmtDuration, hash } from "@shared/format";
import { checkEnv } from "@srv/env";
import { joinWindow } from "@shared/live";
import { dayOptions, joinLocalValue, nextSlot, splitLocalValue, toLocalValue } from "@shared/when";
import { ACCENTS, MAX_LINKS, accentColor, isSafeLink, readLinks } from "@shared/artist";
import { formatNim, lunaToNim, MAX_LUNA, MAX_NIM, nimToLuna, normalizeAddress, shortAddress, TIP_PRESETS_NIM } from "@shared/units";
import { readBars } from "@/lib/spectrum";
import { queueIndex, stepQueue } from "@shared/queue";

/* ---------------- Fan Pass ---------------- */
test("fan pass: a new fan is an Opener with 0 XP and no badges", () => {
  const p = computePass({});
  assert.equal(p.xp, 0);
  assert.equal(p.levelName, "Opener");
  assert.equal(p.nextLevelName, "Regular");
  assert.equal(p.progress, 0);
  assert.equal(p.badges.filter((b) => b.unlocked).length, 0);
});
test("fan pass: XP weights", () => {
  assert.equal(xpFor({ tickets: 1, tracks: 0, memberships: 0, tips: 0, follows: 0, messages: 0, votes: 0 }), 100);
  assert.equal(xpFor({ tickets: 0, tracks: 1, memberships: 1, tips: 1, follows: 1, messages: 1, votes: 1 }), 40 + 250 + 25 + 10 + 2 + 15);
});
test("fan pass: cheap actions are capped so they can't be farmed", () => {
  const big = xpFor({ tickets: 0, tracks: 0, memberships: 0, tips: 0, follows: 9999, messages: 9999, votes: 9999 });
  assert.equal(big, 10 * 10 + 50 * 2 + 10 * 15);
});
test("fan pass: level boundaries are exact", () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const at = LEVELS[i].at;
    assert.equal(computePass({ tickets: 0, tips: 0 }).level, 0);
    // build exactly `at` XP out of tickets (100 each) when possible
    if (at % 100 === 0) assert.equal(computePass({ tickets: at / 100 }).level, i, `at ${at}`);
    if (at >= 100 && at % 100 === 0) assert.equal(computePass({ tickets: at / 100 - 1 }).level, Math.max(0, i - 1), `just below ${at}`);
  }
});
test("fan pass: progress is 0..1 and 1 at the top level", () => {
  assert.ok(computePass({ tickets: 1 }).progress >= 0 && computePass({ tickets: 1 }).progress <= 1);
  const top = computePass({ tickets: 40 });
  assert.equal(top.levelName, "Legend");
  assert.equal(top.progress, 1);
  assert.equal(top.nextLevelName, null);
});
test("fan pass: badge thresholds", () => {
  const unlocked = (s: Parameters<typeof computePass>[0]) => computePass(s).badges.filter((b) => b.unlocked).map((b) => b.id);
  assert.deepEqual(unlocked({ tickets: 1 }), ["first-ticket"]);
  assert.deepEqual(unlocked({ memberships: 1 }), ["backer"]);
  assert.deepEqual(unlocked({ tips: 2 }), []);
  assert.deepEqual(unlocked({ tips: 3 }), ["generous"]);
  assert.deepEqual(unlocked({ messages: 9 }), []);
  assert.deepEqual(unlocked({ messages: 10 }), ["chatterbox"]);
  assert.deepEqual(unlocked({ follows: 3 }), ["explorer"]);
  assert.deepEqual(unlocked({ tracks: 3 }), ["collector"]);
  assert.deepEqual(unlocked({ votes: 1 }), ["voice"]);
});

/* ---------------- Calendar ---------------- */
test("calendar: icsDate formats UTC", () => {
  assert.equal(icsDate(new Date(Date.UTC(2026, 2, 11, 19, 30, 5))), "20260311T193005Z");
});
test("calendar: icsEscape escapes ; , \\ and newlines", () => {
  assert.equal(icsEscape("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
});
test("calendar: buildIcs is a valid VEVENT with CRLF endings and the right end time", () => {
  const start = new Date(Date.UTC(2026, 5, 1, 18, 0, 0));
  const ics = buildIcs({ uid: "abc", title: "Release Night, Vol. 1", description: "Doors; 8pm", url: "https://x.test/show/abc", start, durationMin: 90 });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART:20260601T180000Z"));
  assert.ok(ics.includes("DTEND:20260601T193000Z"));
  assert.ok(ics.includes("SUMMARY:Release Night\\, Vol. 1"));
  assert.ok(ics.includes("DESCRIPTION:Doors\\; 8pm"));
  assert.ok(!/[^\r]\n/.test(ics), "every newline must be CRLF");
});
test("calendar: long lines are folded to <= 75 chars", () => {
  const ics = buildIcs({ uid: "x", title: "T".repeat(300), start: new Date(), durationMin: 30 });
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75, `line too long: ${line.length}`);
});
test("calendar: google link carries title and a start/end range", () => {
  const url = new URL(googleCalendarUrl({ uid: "x", title: "Show A", start: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)), durationMin: 60 }));
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Show A");
  assert.equal(url.searchParams.get("dates"), "20260102T030405Z/20260102T040405Z");
});

/* ---------------- Cover art ---------------- */
test("cover colors: always three defined, distinct tints (regression: signed-shift bug gave undefined)", () => {
  for (let i = 0; i < 5000; i++) {
    const [a, b, c] = coverColors(`seed-${i}-${Math.random()}`);
    assert.ok(a && b && c, `undefined colour for seed ${i}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) && /^#[0-9a-f]{6}$/i.test(c));
    assert.ok(a !== b && b !== c, "adjacent tints must differ");
  }
});
test("cover style: deterministic, no NaN/undefined, gradient stops in range", () => {
  for (let i = 0; i < 2000; i++) {
    const s = String(coverStyle(`id-${i}`).background);
    assert.ok(!/undefined|NaN/.test(s), s);
    for (const m of s.matchAll(/at (\d+)% (\d+)%/g)) {
      assert.ok(+m[1] >= 8 && +m[1] <= 91 && +m[2] >= 8 && +m[2] <= 91, `position out of range in ${s}`);
    }
  }
  assert.equal(JSON.stringify(coverStyle("same")), JSON.stringify(coverStyle("same")));
  assert.equal(hash("a"), hash("a"));
  assert.notEqual(hash("a"), hash("b"));
});

/* ---------------- Formatting / units ---------------- */
test("units: NIM <-> Luna and formatting", () => {
  assert.equal(nimToLuna(1), 100_000);
  assert.equal(lunaToNim(250_000), 2.5);
  assert.equal(formatNim(0), "Free");
  assert.equal(formatNim(0, "0 NIM"), "0 NIM");
  assert.equal(formatNim(150 * 100_000), "150 NIM");
  assert.equal(formatNim(50_000), "0.5 NIM");
  assert.equal(formatNim(1_250 * 100_000), "1,250 NIM");
});
test("units: the 5 NIM price cap", () => {
  assert.equal(MAX_NIM, 5);
  assert.equal(MAX_LUNA, 500_000);
  assert.ok(TIP_PRESETS_NIM.every((p) => p <= MAX_NIM));
});
test("config: production refuses to start without a session secret or with demo payments on", () => {
  const ok = { NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), DATABASE_URL: "d", S3_BUCKET: "b", NIMIQ_RPC_URL: "r", ADMIN_ADDRESSES: "NQ" } as NodeJS.ProcessEnv;
  assert.deepEqual(checkEnv(ok), { errors: [], warnings: [] });
  assert.equal(checkEnv({ ...ok, SESSION_SECRET: "short" }).errors.length, 1);
  assert.equal(checkEnv({ ...ok, SESSION_SECRET: undefined }).errors.length, 1);
  assert.equal(checkEnv({ ...ok, NIMSTAGE_DEMO_PAYMENTS: "1" }).errors.length, 1);
  assert.deepEqual(checkEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv), { errors: [], warnings: [] }, "dev is never blocked");
  const w = checkEnv({ ...ok, NIMIQ_RPC_URL: undefined, ADMIN_ADDRESSES: "", S3_BUCKET: undefined }).warnings;
  assert.equal(w.length, 3);
});
test("live: who may join a video show, and when", () => {
  const start = Date.UTC(2026, 0, 1, 20, 0);
  const show = { startsAt: new Date(start), durationMin: 30 };
  const min = 60_000;
  assert.equal(joinWindow(show, "viewer", start - 16 * min), "early");
  assert.equal(joinWindow(show, "viewer", start - 14 * min), "ok");
  assert.equal(joinWindow(show, "host", start - 59 * min), "ok");
  assert.equal(joinWindow(show, "host", start - 61 * min), "early");
  assert.equal(joinWindow(show, "viewer", start + 30 * min + 29 * min), "ok");
  assert.equal(joinWindow(show, "viewer", start + 30 * min + 31 * min), "ended");
  assert.equal(joinWindow(show, "host", start + 30 * min + 59 * min), "ok");
  assert.equal(joinWindow(show, "host", start + 30 * min + 61 * min), "ended");
});
test("artist profile: only https links with a label survive, and a bad stored row never throws", () => {
  assert.equal(isSafeLink("https://bandcamp.com/mira"), true);
  for (const bad of ["http://example.com", "javascript:alert(1)", "data:text/html,hi", "//example.com", "https://user:pw@example.com", "https://localhost", "not a url", "https://" + "a".repeat(200) + ".com"]) assert.equal(isSafeLink(bad), false, bad);
  const stored = JSON.stringify([
    { label: "Good", url: "https://example.com/a" },
    { label: "", url: "https://example.com/b" },
    { label: "Evil", url: "javascript:alert(1)" },
    { label: "x".repeat(25), url: "https://example.com/c" },
    { nope: true },
    ...Array.from({ length: 6 }, (_, i) => ({ label: "L" + i, url: "https://example.com/" + i })),
  ]);
  const links = readLinks(stored);
  assert.equal(links[0].label, "Good");
  assert.equal(links.length, MAX_LINKS);
  assert.ok(links.every((l) => isSafeLink(l.url) && l.label.length > 0));
  for (const junk of [null, undefined, "", "{", "null", "42", '{"a":1}']) assert.deepEqual(readLinks(junk), [], String(junk));
});
test("artist profile: accents come from a fixed palette", () => {
  assert.equal(accentColor("violet"), ACCENTS.violet);
  assert.equal(accentColor(""), null);
  assert.equal(accentColor("hotpink"), null);
  assert.equal(accentColor(undefined), null);
  assert.ok(Object.values(ACCENTS).every((c) => /^#[0-9a-f]{6}$/i.test(c)));
});
test("scheduler: default start, value round-trip and day list", () => {
  const now = new Date(2026, 10, 8, 22, 50, 31); // 8 Nov 2026, 22:50 local
  const slot = nextSlot(now);
  assert.equal(toLocalValue(slot), "2026-11-08T23:15", "at least 15 minutes ahead, on a quarter hour");
  assert.equal(toLocalValue(nextSlot(new Date(2026, 10, 8, 23, 50))), "2026-11-09T00:15", "rolls past midnight");
  assert.equal(toLocalValue(nextSlot(new Date(2026, 11, 31, 23, 50))), "2027-01-01T00:15", "rolls past new year");
  const parts = splitLocalValue("2026-11-09T19:30")!;
  assert.deepEqual(parts, { date: "2026-11-09", hour: 19, minute: 30 });
  assert.equal(joinLocalValue(parts), "2026-11-09T19:30");
  assert.equal(joinLocalValue({ date: "2026-11-09", hour: 7, minute: 5 }), "2026-11-09T07:05", "zero padded");
  for (const bad of ["", "2026-11-09", "2026-11-09T24:00", "2026-11-09T10:60", "tomorrow"]) assert.equal(splitLocalValue(bad), null, bad);
  assert.equal(new Date(joinLocalValue(parts)).getHours(), 19, "parses as local time, so toISOString() sends the right instant");
  const days = dayOptions(now, 3);
  assert.deepEqual(days.map((d) => d.value), ["2026-11-08", "2026-11-09", "2026-11-10"]);
  assert.match(days[0].label, /^Today/);
  assert.match(days[1].label, /^Tomorrow/);
  assert.equal(dayOptions(new Date(2026, 11, 30), 3)[2].value, "2027-01-01", "crosses the year");
});
test("units: address helpers", () => {
  assert.equal(normalizeAddress("nq07 0000 0000"), "NQ070000" + "0000");
  assert.equal(shortAddress("NQ07 0000 0000 0000 0000 0000 0000 0000 9ABC"), "NQ07 0000…9ABC");
});
test("format: durations", () => {
  assert.equal(fmtDuration(0), "0:00");
  assert.equal(fmtDuration(65), "1:05");
  assert.equal(fmtDuration(-5), "0:00");
  assert.equal(fmtDuration(3600), "60:00");
});

/* ---------------- Player queue ---------------- */
test("queue: steps forward and back, stops at both ends", () => {
  const q = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(stepQueue(q, { id: "a" }, 1)?.id, "b");
  assert.equal(stepQueue(q, { id: "b" }, 1)?.id, "c");
  assert.equal(stepQueue(q, { id: "c" }, 1), null, "no next after the last track");
  assert.equal(stepQueue(q, { id: "b" }, -1)?.id, "a");
  assert.equal(stepQueue(q, { id: "a" }, -1), null, "no previous before the first track");
});
test("queue: a track that isn't queued has no neighbours", () => {
  assert.equal(stepQueue([{ id: "a" }, { id: "b" }], { id: "zzz" }, 1), null);
  assert.equal(stepQueue([{ id: "a" }], null, 1), null);
  assert.equal(stepQueue([], { id: "a" }, 1), null);
});
test("queue: the same track in a different show context is a different entry", () => {
  const q = [{ id: "t1", showId: "s1" }, { id: "t1" }, { id: "t2" }];
  assert.equal(queueIndex(q, { id: "t1" }), 1);
  assert.equal(queueIndex(q, { id: "t1", showId: "s1" }), 0);
  assert.equal(stepQueue(q, { id: "t1", showId: "s1" }, 1)?.id, "t1");
});
test("queue: returns the full item, not a copy of the key", () => {
  const q = [{ id: "a", title: "One" }, { id: "b", title: "Two" }];
  assert.equal(stepQueue(q, { id: "a" }, 1)?.title, "Two");
});

/* ---------------- Spectrum bars (pure part) ---------------- */
test("spectrum: readBars returns `bars` values clamped to 0..1", () => {
  const data = new Uint8Array(64).map((_, i) => (i * 4) % 256);
  const fake = { analyser: { getByteFrequencyData: (a: Uint8Array) => a.set(data) }, data: new Uint8Array(64) } as unknown as Parameters<typeof readBars>[0];
  const bars = readBars(fake, 40);
  assert.equal(bars.length, 40);
  for (const b of bars) assert.ok(b >= 0 && b <= 1 && Number.isFinite(b));
  const silent = { analyser: { getByteFrequencyData: (a: Uint8Array) => a.fill(0) }, data: new Uint8Array(64) } as unknown as Parameters<typeof readBars>[0];
  assert.ok(readBars(silent, 40).every((b) => b === 0));
  const loud = { analyser: { getByteFrequencyData: (a: Uint8Array) => a.fill(255) }, data: new Uint8Array(64) } as unknown as Parameters<typeof readBars>[0];
  assert.ok(readBars(loud, 40).every((b) => b === 1));
});

