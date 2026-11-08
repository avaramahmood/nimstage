import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, rateLimit, requireArtist, requireUser } from "@srv/http";
import { getArtistByUser, getShow, getTiers, getTrack } from "@srv/data";
import { processImage, type ArtKind } from "@srv/images";
import { ACCENT_KEYS, MAX_LINKS, isSafeLink, type ArtistLink } from "@shared/artist";
import { parseAddress } from "@srv/nimiq";
import { AUDIO_EXT, AUDIO_MIME, MAX_UPLOAD_BYTES, deleteMedia, isMp3Upload, looksLikeMp3, saveMedia } from "@srv/storage";
import { MAX_NIM, nimToLuna } from "@shared/units";
import { newId } from "@srv/ids";

export const studio = new Hono();

/* ------------------------------- profile ------------------------------- */
const Profile = z.object({
  handle: z.string().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "Handle: 3–24 letters, numbers or _").optional(),
  name: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(600).default(""),
  genre: z.string().trim().min(2).max(30).default("Indie"),
  tagline: z.string().trim().max(80, "Keep the tagline under 80 characters").default(""),
  accent: z.enum([...ACCENT_KEYS, ""]).default(""),
  links: z
    .array(z.object({ label: z.string().trim().min(1, "Give each link a label").max(24, "Link labels are 24 characters at most"), url: z.string().trim().refine(isSafeLink, "Links must be full https:// addresses") }))
    .max(MAX_LINKS, `At most ${MAX_LINKS} links`)
    .default([]),
  payoutAddress: z.string().trim().min(10, "Enter your Nimiq payout address (starts with NQ)").max(60, "That address is too long"),
  ownsRights: z.literal(true, { error: "Confirm you own the music you upload" }),
});

studio.post("/studio/profile", async (c) => {
  const user = await requireUser(c);
  const b = Profile.parse(await body(c));
  const payout = await parseAddress(b.payoutAddress);
  if (!payout) throw new HttpError("That payout address isn't a valid Nimiq address");
  const db = await getDb();
  const existing = await getArtistByUser(user.id);

  if (existing) {
    await db.update(schema.artists).set({ name: b.name, bio: b.bio, genre: b.genre, payoutAddress: payout, tagline: b.tagline, accent: b.accent, links: JSON.stringify(b.links satisfies ArtistLink[]) }).where(eq(schema.artists.id, existing.id));
    return c.json({ handle: existing.handle });
  }
  // The artist page address is the account's username: one public identity, chosen once on the setup screen.
  const handle = user.username;
  if (!handle) throw new HttpError("Choose your username first");
  const [taken] = await db.select({ id: schema.artists.id }).from(schema.artists).where(eq(schema.artists.handle, handle)).limit(1);
  if (taken) throw new HttpError("That username is already an artist page");
  await db.insert(schema.artists).values({ id: newId(), userId: user.id, handle, name: b.name, bio: b.bio, genre: b.genre, payoutAddress: payout, tagline: b.tagline, accent: b.accent, links: JSON.stringify(b.links) });
  if (user.role === "fan") await db.update(schema.users).set({ role: "artist" }).where(eq(schema.users.id, user.id));
  return c.json({ handle });
});

/* ------------------------------- artwork ------------------------------- */
// PUT /studio/art/:kind/:id   (multipart "file")   replaces the image
// DELETE /studio/art/:kind/:id                     goes back to the generated art
// avatar and banner belong to your own profile (id is ignored); track and show need one you own.
const ART_KINDS = new Set<ArtKind>(["avatar", "banner", "track", "show"]);

async function artTarget(kind: ArtKind, id: string, artistId: string) {
  const db = await getDb();
  if (kind === "avatar" || kind === "banner") {
    const col = kind === "avatar" ? "avatarKey" : "bannerKey";
    const [row] = await db.select({ key: schema.artists[col] }).from(schema.artists).where(eq(schema.artists.id, artistId)).limit(1);
    return { old: row?.key ?? null, set: (key: string | null) => db.update(schema.artists).set({ [col]: key }).where(eq(schema.artists.id, artistId)) };
  }
  if (kind === "track") {
    const t = await getTrack(id);
    if (!t || t.artistId !== artistId) throw new HttpError("That track isn't yours", 404);
    return { old: t.coverKey, set: (key: string | null) => db.update(schema.tracks).set({ coverKey: key }).where(eq(schema.tracks.id, t.id)) };
  }
  const s = await getShow(id);
  if (!s || s.artistId !== artistId) throw new HttpError("That show isn't yours", 404);
  return { old: s.coverKey, set: (key: string | null) => db.update(schema.shows).set({ coverKey: key }).where(eq(schema.shows.id, s.id)) };
}

studio.put("/studio/art/:kind/:id", async (c) => {
  const { artist } = await requireArtist(c);
  rateLimit(`art:${artist.id}`, 20, 10 * 60_000);
  const kind = c.req.param("kind") as ArtKind;
  if (!ART_KINDS.has(kind)) throw new HttpError("Unknown artwork type", 404);
  const target = await artTarget(kind, c.req.param("id"), artist.id);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new HttpError("Invalid upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError("Choose an image");
  const webp = await processImage(Buffer.from(await file.arrayBuffer()), kind);
  const key = await saveMedia(webp, "webp");
  await target.set(key);
  if (target.old) void deleteMedia(target.old);
  return c.json({ key });
});

studio.delete("/studio/art/:kind/:id", async (c) => {
  const { artist } = await requireArtist(c);
  const kind = c.req.param("kind") as ArtKind;
  if (!ART_KINDS.has(kind)) throw new HttpError("Unknown artwork type", 404);
  const target = await artTarget(kind, c.req.param("id"), artist.id);
  await target.set(null);
  if (target.old) void deleteMedia(target.old);
  return c.json({ ok: true });
});

/* ------------------------------- tracks ------------------------------- */
const TrackFields = z.object({
  title: z.string().trim().min(1).max(80),
  priceNim: z.coerce.number().min(0).max(MAX_NIM).default(0),
  durationSec: z.coerce.number().int().min(5).max(7200),
  previewSec: z.coerce.number().int().min(10).max(60).default(30),
  ownsRights: z.literal("true", { error: "Confirm you own this music" }),
});

studio.post("/studio/tracks", async (c) => {
  const { artist } = await requireArtist(c);
  rateLimit(`upload:${artist.id}`, 30, 10 * 60_000); // enough for an album's worth of tracks
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new HttpError("Invalid upload");
  }
  const f = TrackFields.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError("Choose an audio file");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError("Audio must be under 40 MB");
  if (!isMp3Upload(file)) throw new HttpError("Upload an MP3 file (.mp3)");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikeMp3(bytes)) throw new HttpError("That file doesn't look like a valid MP3");

  const key = await saveMedia(bytes, AUDIO_EXT);
  const id = newId();
  const db = await getDb();
  await db.insert(schema.tracks).values({
    id,
    artistId: artist.id,
    title: f.title,
    durationSec: f.durationSec,
    priceLuna: nimToLuna(f.priceNim),
    previewSec: Math.min(f.previewSec, f.durationSec),
    mediaKey: key,
    mime: AUDIO_MIME,
  });
  return c.json({ id });
});

/* ------------------------------- shows ------------------------------- */
const ShowBody = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).default(""),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(5).max(24 * 60 * 7),
  priceNim: z.number().min(0).max(MAX_NIM),
  kind: z.enum(["premiere", "live"]).default("premiere"),
  // Audio premieres play one of the artist's tracks; live video shows don't use a track.
  trackId: z.string().max(64).optional(),
});

studio.post("/studio/shows", async (c) => {
  const { artist } = await requireArtist(c);
  const b = ShowBody.parse(await body(c));
  const track = b.kind === "premiere" ? await getTrack(b.trackId ?? "") : null;
  if (b.kind === "premiere" && (!track || track.artistId !== artist.id || track.status !== "published")) throw new HttpError("Pick one of your own tracks as the show audio");
  const id = newId();
  const db = await getDb();
  await db.insert(schema.shows).values({
    id,
    artistId: artist.id,
    title: b.title,
    description: b.description,
    startsAt: new Date(b.startsAt),
    durationMin: b.durationMin,
    priceLuna: nimToLuna(b.priceNim),
    trackId: track?.id ?? null,
    kind: b.kind,
  });
  return c.json({ id });
});

/* ------------------------------- posts ------------------------------- */
const PostBody = z.object({ body: z.string().trim().min(1).max(1000), tierId: z.string().max(64).nullable().default(null) });

studio.post("/studio/posts", async (c) => {
  const { artist } = await requireArtist(c);
  const b = PostBody.parse(await body(c));
  const db = await getDb();
  if (b.tierId) {
    const [tier] = await db.select().from(schema.tiers).where(and(eq(schema.tiers.id, b.tierId), eq(schema.tiers.artistId, artist.id))).limit(1);
    if (!tier) throw new HttpError("Choose one of your own tiers");
  }
  const id = newId();
  await db.insert(schema.posts).values({ id, artistId: artist.id, body: b.body, tierId: b.tierId });
  return c.json({ id });
});

/* ------------------------------- tiers ------------------------------- */
const TierBody = z.object({
  name: z.string().trim().min(2).max(30),
  perks: z.string().trim().max(200).default(""),
  priceNim: z.number().min(0.5).max(MAX_NIM),
});

studio.post("/studio/tiers", async (c) => {
  const { artist } = await requireArtist(c);
  const b = TierBody.parse(await body(c));
  if ((await getTiers(artist.id)).length >= 3) throw new HttpError("Three tiers is the maximum");
  const id = newId();
  const db = await getDb();
  await db.insert(schema.tiers).values({ id, artistId: artist.id, name: b.name, perks: b.perks, priceLuna: nimToLuna(b.priceNim) });
  return c.json({ id });
});

studio.delete("/studio/tiers", async (c) => {
  const { artist } = await requireArtist(c);
  const { id } = z.object({ id: z.string().max(64) }).parse(await body(c));
  const db = await getDb();
  if (!(await getTiers(artist.id)).some((t) => t.id === id)) throw new HttpError("Tier not found", 404);
  await db.delete(schema.tiers).where(eq(schema.tiers.id, id));
  return c.json({ ok: true });
});

/* ------------------------------- polls ------------------------------- */
const PollCreate = z.object({
  question: z.string().trim().min(5, "Ask a question (at least 5 characters)").max(140),
  options: z.array(z.string().trim().min(1).max(60)).min(2, "Add at least two options").max(5, "Five options at most"),
  tierId: z.string().max(64).nullable().default(null),
});

studio.post("/studio/polls", async (c) => {
  const { artist } = await requireArtist(c);
  rateLimit(`poll:${artist.id}`, 10, 60_000);
  const b = PollCreate.parse(await body(c));
  const labels = [...new Set(b.options.map((o) => o.trim()))];
  if (labels.length < 2) throw new HttpError("Options must be different from each other");

  const db = await getDb();
  if (b.tierId) {
    const [tier] = await db.select().from(schema.tiers).where(and(eq(schema.tiers.id, b.tierId), eq(schema.tiers.artistId, artist.id))).limit(1);
    if (!tier) throw new HttpError("Choose one of your own tiers");
  }
  const id = newId();
  await db.insert(schema.polls).values({ id, artistId: artist.id, question: b.question, tierId: b.tierId });
  await db.insert(schema.pollOptions).values(labels.map((label, position) => ({ id: newId(), pollId: id, label, position })));
  return c.json({ id });
});

/** Close a poll (results stay visible, voting stops). */
studio.patch("/studio/polls", async (c) => {
  const { artist } = await requireArtist(c);
  const { id } = z.object({ id: z.string().max(64) }).parse(await body(c));
  const db = await getDb();
  const res = await db
    .update(schema.polls)
    .set({ status: "closed" })
    .where(and(eq(schema.polls.id, id), eq(schema.polls.artistId, artist.id), eq(schema.polls.status, "open")))
    .returning({ id: schema.polls.id });
  if (!res.length) throw new HttpError("Open poll not found", 404);
  return c.json({ ok: true });
});

/* ------------------------------- remove ------------------------------- */
studio.post("/studio/remove", async (c) => {
  const { artist } = await requireArtist(c);
  const { kind, id } = z.object({ kind: z.enum(["track", "show", "post", "poll"]), id: z.string().max(64) }).parse(await body(c));
  const db = await getDb();
  const t = kind === "track" ? schema.tracks : kind === "show" ? schema.shows : kind === "post" ? schema.posts : schema.polls;
  const res = await db.update(t).set({ status: "removed" }).where(and(eq(t.id, id), eq(t.artistId, artist.id))).returning({ id: t.id });
  if (!res.length) throw new HttpError("Not found", 404);
  return c.json({ ok: true });
});
