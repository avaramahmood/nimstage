import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, clientIp, rateLimit, requireUser } from "@srv/http";
import { clearSession, getUser, mediaToken, setSession } from "@srv/session";
import { findAddressProof, parseAddress, proofTarget, verifyLoginSignature } from "@srv/nimiq";
import { normalizeAddress } from "@shared/units";
import { sessionUserView } from "@srv/userview";
import { newId } from "@srv/ids";
import { getArtistByUser, getFanPass } from "@srv/data";
import { demoPaymentsEnabled, reconcileSoon } from "@srv/payments";

export const auth = new Hono();

auth.post("/auth/challenge", async (c) => {
  rateLimit(`challenge:${clientIp(c)}`, 30, 60_000);
  const nonce = randomBytes(16).toString("hex");
  const issued = new Date();
  const message = `Sign in to NimStage\nNonce: ${nonce}\nIssued: ${issued.toISOString()}`;
  const db = await getDb();
  await db.insert(schema.authChallenges).values({ nonce, message, expiresAt: new Date(issued.getTime() + 5 * 60_000) });
  return c.json({ nonce, message });
});

const PROOF_PREFIX = "address:";

/** The account for a wallet address, created on first sight. Only call this once ownership of the address is proven. */
async function userForAddress(norm: string) {
  const db = await getDb();
  let [user] = await db.select().from(schema.users).where(eq(schema.users.address, norm)).limit(1);
  if (!user) {
    const admins = (process.env.ADMIN_ADDRESSES ?? "").split(",").map(normalizeAddress).filter(Boolean);
    // No name yet: the wallet address is not a name. The setup screen makes them choose a username.
    [user] = await db.insert(schema.users).values({ id: newId(), address: norm, displayName: "New listener", role: admins.includes(norm) ? "admin" : "fan" }).returning();
  }
  return user;
}

const Verify = z.object({ nonce: z.string().length(32), publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/), signature: z.string().regex(/^[0-9a-fA-F]{128}$/) });

auth.post("/auth/verify", async (c) => {
  rateLimit(`verify:${clientIp(c)}`, 20, 60_000);
  const b = Verify.parse(await body(c));
  const db = await getDb();

  const [challenge] = await db.select().from(schema.authChallenges).where(eq(schema.authChallenges.nonce, b.nonce)).limit(1);
  if (!challenge || challenge.used || challenge.expiresAt < new Date()) throw new HttpError("Login expired, try again", 400);
  // Single use, consumed before verification so a failed attempt can't be replayed either.
  await db.update(schema.authChallenges).set({ used: true }).where(eq(schema.authChallenges.nonce, b.nonce));

  // The address-proof and device-pairing challenges (below) are different flows: they can never be redeemed with a signature.
  if (!challenge.message.startsWith("Sign in to NimStage")) throw new HttpError("Login expired, try again", 400);
  const address = await verifyLoginSignature(challenge.message, b.publicKey, b.signature);
  if (!address) throw new HttpError("Signature could not be verified", 401);

  const user = await userForAddress(normalizeAddress(address));
  const token = await setSession(c, user.id);
  return c.json({ user: sessionUserView(user), token });
});

/*
  Sign-in from a normal browser (no Nimiq Pay). Paste your address; to prove it is yours, send one luna
  (0.00001 NIM) from it with a code in the message. A transaction's sender is fixed by its signature, so
  seeing it on mainnet proves you hold the key. Nothing else is ever asked of the wallet.
*/
const PROOF_MINUTES = 20;

auth.post("/auth/address/start", async (c) => {
  rateLimit(`addr-start:${clientIp(c)}`, 12, 60_000);
  const { address } = z.object({ address: z.string().min(20).max(60) }).parse(await body(c));
  const friendly = await parseAddress(address);
  if (!friendly) throw new HttpError("That doesn't look like a Nimiq address. It starts with NQ and has 9 groups of 4 characters.", 400);
  const nonce = randomBytes(16).toString("hex");
  const db = await getDb();
  await db.insert(schema.authChallenges).values({ nonce, message: PROOF_PREFIX + normalizeAddress(friendly), expiresAt: new Date(Date.now() + PROOF_MINUTES * 60_000) });
  return c.json({ code: nonce, address: friendly, to: proofTarget(friendly), amountLuna: 1, memo: `NSL:${nonce}`, minutes: PROOF_MINUTES });
});

auth.post("/auth/address/check", async (c) => {
  rateLimit(`addr-check:${clientIp(c)}`, 90, 60_000);
  const { code } = z.object({ code: z.string().length(32) }).parse(await body(c));
  const db = await getDb();
  const [challenge] = await db.select().from(schema.authChallenges).where(eq(schema.authChallenges.nonce, code)).limit(1);
  if (!challenge || !challenge.message.startsWith(PROOF_PREFIX) || challenge.used || challenge.expiresAt < new Date()) throw new HttpError("This code expired. Start again to get a new one.", 400);
  const address = challenge.message.slice(PROOF_PREFIX.length);
  const proof = await findAddressProof(address, proofTarget(address), `NSL:${code}`);
  if (proof.status !== "ok") return c.json({ status: "pending", reason: proof.reason });
  // Single use: whoever flips the flag first gets the session.
  const claimed = await db.update(schema.authChallenges).set({ used: true }).where(and(eq(schema.authChallenges.nonce, code), eq(schema.authChallenges.used, false))).returning({ nonce: schema.authChallenges.nonce });
  if (!claimed.length) throw new HttpError("This code was already used.", 400);
  const user = await userForAddress(address);
  const token = await setSession(c, user.id);
  return c.json({ status: "ok", user: sessionUserView(user), token });
});

/*
  Sign in on another device. The browser shows a short code; someone already signed in (inside Nimiq Pay, where
  the wallet can sign) approves that code, and the browser's next poll receives a session for that account.
  The code is for people to read and type; the polling secret never leaves the browser that asked.
*/
const PAIR_PREFIX = "pair:";
const PAIR_MINUTES = 10;
const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const pairCode = () => Array.from(randomBytes(8), (b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join("");
const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

auth.post("/auth/pair/start", async (c) => {
  rateLimit(`pair-start:${clientIp(c)}`, 12, 60_000);
  const code = pairCode();
  const secret = randomBytes(16).toString("hex");
  const db = await getDb();
  await db.insert(schema.authChallenges).values({ nonce: secret, message: PAIR_PREFIX + code, expiresAt: new Date(Date.now() + PAIR_MINUTES * 60_000) });
  return c.json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, secret, minutes: PAIR_MINUTES });
});

auth.post("/auth/pair/approve", async (c) => {
  const user = await requireUser(c);
  rateLimit(`pair-approve:${user.id}`, 10, 60_000);
  const code = cleanCode(z.object({ code: z.string().min(6).max(16) }).parse(await body(c)).code);
  const db = await getDb();
  const done = await db
    .update(schema.authChallenges)
    .set({ message: `${PAIR_PREFIX}${code}:${user.id}` })
    .where(and(eq(schema.authChallenges.message, PAIR_PREFIX + code), eq(schema.authChallenges.used, false), gt(schema.authChallenges.expiresAt, new Date())))
    .returning({ nonce: schema.authChallenges.nonce });
  if (!done.length) throw new HttpError("That code isn't valid or has expired. Get a new one on the other device.", 400);
  return c.json({ ok: true });
});

auth.post("/auth/pair/check", async (c) => {
  rateLimit(`pair-check:${clientIp(c)}`, 120, 60_000);
  const { secret } = z.object({ secret: z.string().length(32) }).parse(await body(c));
  const db = await getDb();
  const [row] = await db.select().from(schema.authChallenges).where(eq(schema.authChallenges.nonce, secret)).limit(1);
  if (!row || !row.message.startsWith(PAIR_PREFIX) || row.used || row.expiresAt < new Date()) throw new HttpError("This code expired. Get a new one.", 400);
  const userId = row.message.slice(PAIR_PREFIX.length).split(":")[1];
  if (!userId) return c.json({ status: "pending" });
  const claimed = await db.update(schema.authChallenges).set({ used: true }).where(and(eq(schema.authChallenges.nonce, secret), eq(schema.authChallenges.used, false))).returning({ nonce: schema.authChallenges.nonce });
  if (!claimed.length) throw new HttpError("This code was already used.", 400);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw new HttpError("That account no longer exists.", 400);
  const token = await setSession(c, user.id);
  return c.json({ status: "ok", user: sessionUserView(user), token });
});

// Persona login for demos and local development (no wallet needed). Enabled only with NIMSTAGE_DEMO=1.
const PERSONAS = { fan: "demo-fan", artist: "demo-artist-1", admin: "demo-admin" } as const;

auth.post("/auth/demo", async (c) => {
  if (process.env.NIMSTAGE_DEMO !== "1") throw new HttpError("Demo login is disabled", 403);
  const { persona } = z.object({ persona: z.enum(["fan", "artist", "admin"]) }).parse(await body(c));
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, PERSONAS[persona])).limit(1);
  if (!user) throw new HttpError("Demo data not seeded", 500);
  const token = await setSession(c, user.id);
  return c.json({ user: sessionUserView(user), token });
});

auth.post("/auth/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await getUser(c);
  const config = { demo: process.env.NIMSTAGE_DEMO === "1", demoPayments: demoPaymentsEnabled() };
  if (!user) return c.json({ user: null, artist: null, config });
  await reconcileSoon({ userId: user.id }); // a payment sent but never confirmed here is found by its memo
  const artist = await getArtistByUser(user.id);
  return c.json({
    user: sessionUserView(user),
    artist: artist ? { id: artist.id, handle: artist.handle, name: artist.name } : null,
    config,
  });
});

/** A narrow token so <audio> (which can't send headers) can still unlock what you have access to. */
auth.get("/me/media-token", async (c) => {
  const user = await requireUser(c);
  return c.json({ token: await mediaToken(user.id) });
});

auth.get("/me/pass", async (c) => {
  const user = await requireUser(c);
  return c.json({ pass: await getFanPass(user.id) });
});
