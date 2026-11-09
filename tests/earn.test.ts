// Unit tests for the staking and follow helpers (pure logic, no server).  Run: npm run test:unit -- tests/earn.test.ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { ESTIMATE_APY, MIN_STAKE_NIM, payoutText, yearlyEstimate } from "@/lib/earn";
import { followedFirst } from "@/lib/foryou";
import { normalizeStaker, slimValidators } from "@srv/staking";

// valid-looking addresses (the check is structural; the server also validates with @nimiq/core where it matters)
const A1 = "NQ51 SURF MCTM AQXM 15PA K9FX 8EEX 29BE VGH8";
const A2 = "NQ82 C0PX LNFH CCAY KENQ 1CEV U2FX R2Y7 4YB2";
const A3 = "NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7";

const raw = (over: Record<string, unknown> = {}) => ({ name: "Pool", address: A1, fee: 0.05, payoutType: "restake", payoutSchedule: "Every 12 hours", isListed: true, score: { total: 0.9 }, ...over });

test("validators: only listed, well-formed pools are kept", () => {
  const out = slimValidators([raw(), raw({ name: "Hidden", isListed: false }), raw({ name: "No address", address: undefined }), raw({ name: "Bad address", address: "NQ00 nope" }), null, "junk", 7]);
  assert.deepEqual(out.map((v) => v.name), ["Pool"]);
});

test("validators: best score first, then lowest fee", () => {
  const out = slimValidators([raw({ name: "B", score: { total: 0.5 } }), raw({ name: "A", score: { total: 0.9 }, fee: 0.05 }), raw({ name: "C", score: { total: 0.9 }, fee: 0.02 })]);
  assert.deepEqual(out.map((v) => v.name), ["C", "A", "B"]);
});

test("validators: logos and other heavy fields never reach the screen", () => {
  const [v] = slimValidators([raw({ logo: "data:image/svg+xml;base64," + "A".repeat(100_000), accentColor: "#fff", extra: { big: "x".repeat(50_000) } })]);
  assert.ok(JSON.stringify(v).length < 600);
  assert.equal("logo" in v, false);
});

test("validators: odd values are clamped, not trusted", () => {
  const [v] = slimValidators([raw({ fee: 7, payoutType: "bitcoin", score: { total: 12 }, website: "javascript:alert(1)", description: "x".repeat(900), name: "n".repeat(200) })]);
  assert.equal(v.fee, 0);
  assert.equal(v.payoutType, "none");
  assert.equal(v.score, 1);
  assert.equal(v.website, null);
  assert.equal(v.description?.length, 240);
  assert.equal(v.name.length, 60);
  assert.equal(slimValidators([raw({ fee: -1 })])[0].fee, 0);
  assert.equal(slimValidators([raw({ score: null })])[0].score, 0);
});

test("validators: at most 40, and anything that isn't a list is empty", () => {
  assert.equal(slimValidators(Array.from({ length: 80 }, (_, i) => raw({ name: `P${i}`, address: i % 2 ? A1 : A2 }))).length, 40);
  assert.deepEqual(slimValidators({ not: "a list" }), []);
  assert.deepEqual(slimValidators(undefined), []);
});

test("a staker's position: missing and bad numbers count as zero", () => {
  assert.deepEqual(normalizeStaker({ balance: 2_500_000, inactiveBalance: 100, retiredBalance: 5, delegation: A3 }, A1), { address: A1, balance: 2_500_000, inactiveBalance: 100, retiredBalance: 5, delegation: A3 });
  assert.deepEqual(normalizeStaker({}, A1), { address: A1, balance: 0, inactiveBalance: 0, retiredBalance: 0, delegation: null });
  const odd = normalizeStaker({ balance: -5, inactiveBalance: Number.NaN, retiredBalance: "7", delegation: 12 }, A1);
  assert.equal(odd.balance, 0);
  assert.equal(odd.inactiveBalance, 0);
  assert.equal(odd.retiredBalance, 7);
  assert.equal(odd.delegation, null);
});

test("the yearly estimate is rate x amount after the pool's fee, and never negative", () => {
  assert.equal(yearlyEstimate(1000, 0), 1000 * ESTIMATE_APY);
  assert.ok(Math.abs(yearlyEstimate(1000, 0.05) - 1000 * ESTIMATE_APY * 0.95) < 1e-9);
  assert.equal(yearlyEstimate(0, 0.05), 0);
  assert.ok(yearlyEstimate(100, 1) === 0);
});

test("staking minimum and the labels people read", () => {
  assert.equal(MIN_STAKE_NIM, 100);
  assert.match(payoutText({ payoutType: "restake", payoutSchedule: "Every 12 hours" }), /added to your stake.*12 hours/);
  assert.match(payoutText({ payoutType: "direct", payoutSchedule: "" }), /paid to your wallet/);
  assert.match(payoutText({ payoutType: "none", payoutSchedule: "" }), /Doesn't pay out/);
});

test("followed artists come first, and the rest keep their order", () => {
  const items = [{ a: "x", n: 1 }, { a: "y", n: 2 }, { a: "z", n: 3 }, { a: "y", n: 4 }];
  assert.deepEqual(followedFirst(items, ["y"], (i) => i.a).map((i) => i.n), [2, 4, 1, 3]);
  assert.deepEqual(followedFirst(items, [], (i) => i.a), items);
  assert.deepEqual(followedFirst(items, undefined, (i) => i.a), items);
  assert.deepEqual(followedFirst(items, ["nobody"], (i) => i.a), items);
  assert.equal(items[0].n, 1); // the input is not reordered in place
});
