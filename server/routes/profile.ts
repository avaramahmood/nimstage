import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@srv/db";
import { HttpError, body, clientIp, rateLimit, requireUser } from "@srv/http";
import { getUser } from "@srv/session";
import { getArtistByUser, getFanPass } from "@srv/data";
import { processImage } from "@srv/images";
import { deleteMedia, saveMedia } from "@srv/storage";
import { readLinks } from "@shared/artist";
import { USERNAME_MESSAGES, usernameProblem } from "@shared/username";
import { z } from "zod";

export const profile = new Hono();
const { users, artists, follows } = schema;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Taken = another account has it, or another artist page uses it as a handle. Case-insensitive. */
async function isTaken(name: string, exceptUserId?: string) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${name}`).limit(1);
  if (u && u.id !== exceptUserId) return true;
  const [a] = await db.select({ userId: artists.userId }).from(artists).where(sql`lower(${artists.handle}) = ${name}`).limit(1);
  return !!a && a.userId !== exceptUserId;
}

/** Your own profile, in full, for the editor. */
profile.get("/me/profile", async (c) => {
  const u = await requireUser(c);
  return c.json({
    username: u.username,
    name: u.displayName,
    bio: u.bio,
    avatarKey: u.avatarKey,
    bannerKey: u.bannerKey,
    accent: u.accent,
    links: readLinks(u.links),
    showPass: u.showPass,
    joinedAt: u.createdAt,
    // After the first change, a new username can be chosen once a week.
    nextUsernameChange: u.username && u.usernameChangedAt ? new Date(u.usernameChangedAt.getTime() + WEEK_MS) : null,
    canChangeUsername: !u.username || !u.usernameChangedAt || Date.now() - u.usernameChangedAt.getTime() >= WEEK_MS,
  });
});

/** Live availability check for the setup form. */
profile.get("/username/check", async (c) => {
  rateLimit(`ucheck:${clientIp(c)}`, 40, 60_000);
  const name = (c.req.query("u") ?? "").trim().toLowerCase();
  const problem = usernameProblem(name);
  if (problem) return c.json({ available: false, reason: problem, message: USERNAME_MESSAGES[problem] });
  const me = await getUser(c);
  if (await isTaken(name, me?.id)) return c.json({ available: false, reason: "taken", message: "That username is taken." });
  return c.json({ available: true });
});

/**
 * Set or change your username. The first time is free; after that, once a week, so names can't be
 * flipped to impersonate someone. For an artist it is also their page address, so it moves with it.
 */
profile.put("/me/username", async (c) => {
  const user = await requireUser(c);
  rateLimit(`uset:${user.id}`, 20, 60_000);
  const name = z.object({ username: z.string() }).parse(await body(c)).username.trim().toLowerCase();
  const problem = usernameProblem(name);
  if (problem) throw new HttpError(USERNAME_MESSAGES[problem]);
  if (user.username === name) return c.json({ username: name });
  if (user.username && user.usernameChangedAt && Date.now() - user.usernameChangedAt.getTime() < WEEK_MS) throw new HttpError("You can change your username once a week.", 429);
  if (await isTaken(name, user.id)) throw new HttpError("That username is taken.", 409);

  const db = await getDb();
  const artist = await getArtistByUser(user.id);
  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ username: name, usernameChangedAt: user.username ? new Date() : null }).where(eq(users.id, user.id));
      if (artist) await tx.update(artists).set({ handle: name }).where(eq(artists.id, artist.id));
    });
  } catch {
    throw new HttpError("That username is taken.", 409); // lost a race with someone choosing it at the same moment
  }
  return c.json({ username: name });
});

/** Profile picture and banner: for every account (artists have their own on the artist page too). */
profile.put("/me/art/:kind", async (c) => {
  const user = await requireUser(c);
  rateLimit(`uart:${user.id}`, 20, 10 * 60_000);
  const kind = c.req.param("kind");
  if (kind !== "avatar" && kind !== "banner") throw new HttpError("Unknown artwork type", 404);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new HttpError("Invalid upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError("Choose an image");
  const key = await saveMedia(await processImage(Buffer.from(await file.arrayBuffer()), kind), "webp");
  const old = kind === "avatar" ? user.avatarKey : user.bannerKey;
  const db = await getDb();
  await db.update(users).set(kind === "avatar" ? { avatarKey: key } : { bannerKey: key }).where(eq(users.id, user.id));
  if (old) void deleteMedia(old);
  return c.json({ key });
});

profile.delete("/me/art/:kind", async (c) => {
  const user = await requireUser(c);
  const kind = c.req.param("kind");
  if (kind !== "avatar" && kind !== "banner") throw new HttpError("Unknown artwork type", 404);
  const old = kind === "avatar" ? user.avatarKey : user.bannerKey;
  const db = await getDb();
  await db.update(users).set(kind === "avatar" ? { avatarKey: null } : { bannerKey: null }).where(eq(users.id, user.id));
  if (old) void deleteMedia(old);
  return c.json({ ok: true });
});

/**
 * A public profile. Shows what the person chose to show: name, picture, bio, links, accent, fan level
 * (unless hidden) and the artists they follow. Never wallet addresses, purchases or the account id.
 * An artist's profile *is* their artist page, so those redirect there.
 */
profile.get("/users/:username", async (c) => {
  const name = c.req.param("username").toLowerCase();
  const db = await getDb();
  const [u] = await db.select().from(users).where(sql`lower(${users.username}) = ${name}`).limit(1);
  if (!u || u.address.startsWith("deleted-")) throw new HttpError("No one here", 404);

  const artist = await getArtistByUser(u.id);
  if (artist && artist.status === "active") return c.json({ artistHandle: artist.handle });

  const viewer = await getUser(c);
  const following = await db
    .select({ id: artists.id, handle: artists.handle, name: artists.name, genre: artists.genre, avatarKey: artists.avatarKey })
    .from(follows)
    .innerJoin(artists, eq(follows.artistId, artists.id))
    .where(and(eq(follows.userId, u.id), eq(artists.status, "active")))
    .orderBy(desc(artists.createdAt))
    .limit(24);
  const pass = u.showPass ? await getFanPass(u.id) : null;
  return c.json({
    user: { username: u.username, name: u.displayName, bio: u.bio, avatarKey: u.avatarKey, bannerKey: u.bannerKey, accent: u.accent, links: readLinks(u.links), joinedAt: u.createdAt },
    pass: pass && { levelName: pass.levelName, level: pass.level, badges: pass.badges.filter((b) => b.unlocked).map((b) => ({ id: b.id, name: b.name })) },
    following,
    isMe: viewer?.id === u.id,
  });
});
