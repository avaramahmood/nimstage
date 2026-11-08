import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, clientIp, rateLimit, requireUser } from "@srv/http";
import { clearSession, getUser, mediaToken, setSession } from "@srv/session";
import { verifyLoginSignature } from "@srv/nimiq";
import { normalizeAddress, shortAddress } from "@shared/units";
import { newId } from "@srv/ids";
import { getArtistByUser, getFanPass } from "@srv/data";
import { demoPaymentsEnabled } from "@srv/payments";

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

const Verify = z.object({ nonce: z.string().length(32), publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/), signature: z.string().regex(/^[0-9a-fA-F]{128}$/) });

auth.post("/auth/verify", async (c) => {
  rateLimit(`verify:${clientIp(c)}`, 20, 60_000);
  const b = Verify.parse(await body(c));
  const db = await getDb();

  const [challenge] = await db.select().from(schema.authChallenges).where(eq(schema.authChallenges.nonce, b.nonce)).limit(1);
  if (!challenge || challenge.used || challenge.expiresAt < new Date()) throw new HttpError("Login expired, try again", 400);
  // Single use, consumed before verification so a failed attempt can't be replayed either.
  await db.update(schema.authChallenges).set({ used: true }).where(eq(schema.authChallenges.nonce, b.nonce));

  const address = await verifyLoginSignature(challenge.message, b.publicKey, b.signature);
  if (!address) throw new HttpError("Signature could not be verified", 401);

  const norm = normalizeAddress(address);
  let [user] = await db.select().from(schema.users).where(eq(schema.users.address, norm)).limit(1);
  if (!user) {
    const admins = (process.env.ADMIN_ADDRESSES ?? "").split(",").map(normalizeAddress).filter(Boolean);
    user = { id: newId(), address: norm, displayName: shortAddress(address), role: admins.includes(norm) ? "admin" : "fan", createdAt: new Date() };
    await db.insert(schema.users).values(user);
  }
  const token = await setSession(c, user.id);
  return c.json({ user: { id: user.id, name: user.displayName, role: user.role, address }, token });
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
  return c.json({ user: { id: user.id, name: user.displayName, role: user.role, address: user.address }, token });
});

auth.post("/auth/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await getUser(c);
  const config = { demo: process.env.NIMSTAGE_DEMO === "1", demoPayments: demoPaymentsEnabled() };
  if (!user) return c.json({ user: null, artist: null, config });
  const artist = await getArtistByUser(user.id);
  return c.json({
    user: { id: user.id, name: user.displayName, role: user.role, address: user.address },
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
