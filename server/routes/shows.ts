import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, clientIp, rateLimit, requireUser } from "@srv/http";
import { getUser } from "@srv/session";
import { REACTION_EMOJI, accessCtx, addReactions, canAccess, getChat, getReactions, getShow, hereNow, touchPresence } from "@srv/data";
import { newId } from "@srv/ids";
import { showView } from "@srv/views";
import { endRoom, livekitConfigured, mintToken } from "@srv/livekit";
import { joinWindow } from "@shared/live";

export const shows = new Hono();

shows.get("/shows/:id", async (c) => {
  const view = await showView(c.req.param("id"), await accessCtx(await getUser(c)));
  if (!view) throw new HttpError("Show not found", 404);
  return c.json(view);
});

/* --------------------------- live video (LiveKit) --------------------------- */

async function liveShow(id: string) {
  const show = await getShow(id);
  if (!show || show.status !== "scheduled" || show.kind !== "live") throw new HttpError("This isn't a live video show", 404);
  if (!livekitConfigured()) throw new HttpError("Live video isn't set up on this server", 503);
  return show;
}

/**
 * A token to join this show's video room. The artist gets one that can publish; ticket holders,
 * supporters and viewers of a free show get one that can only watch. Nobody else gets anything.
 */
shows.post("/shows/:id/live/token", async (c) => {
  const user = await requireUser(c);
  rateLimit(`livetoken:${user.id}`, 20, 60_000);
  const show = await liveShow(c.req.param("id"));
  const ac = await accessCtx(user);
  const host = ac.ownArtistId === show.artistId;
  if (!host && !canAccess(ac, "show", show)) throw new HttpError("Get a ticket to watch", 403);
  const win = joinWindow(show, host ? "host" : "viewer");
  if (win === "early") throw new HttpError("The room isn't open yet", 409);
  if (win === "ended") throw new HttpError("This show has ended", 410);
  const token = await mintToken({ showId: show.id, identity: user.id, name: user.username ?? user.displayName, host, ttlSec: 3 * 60 * 60 });
  return c.json({ token, url: process.env.LIVEKIT_URL, role: host ? "host" : "viewer" });
});

/** The artist ends the stream: everyone is disconnected. */
shows.post("/shows/:id/live/end", async (c) => {
  const user = await requireUser(c);
  const show = await liveShow(c.req.param("id"));
  if ((await accessCtx(user)).ownArtistId !== show.artistId) throw new HttpError("Only the artist can end the stream", 403);
  await endRoom(show.id);
  return c.json({ ok: true });
});

/**
 * One poll returns everything the live room needs: new chat messages, reaction totals and how many
 * people are in the room. Passing `cid` (a random per-tab id) also marks that tab as present.
 */
shows.get("/shows/:id/chat", async (c) => {
  const id = c.req.param("id");
  const cid = c.req.query("cid");
  const validCid = cid && /^[a-z0-9]{8,32}$/.test(cid) ? cid : null;
  if (validCid) rateLimit(`live:${id}:${validCid}`, 40, 60_000);
  const [messages, reactions, here] = await Promise.all([getChat(id, c.req.query("after") ?? undefined), getReactions(id), validCid ? touchPresence(id, validCid) : hereNow(id)]);
  return c.json({
    messages: messages.map((m) => ({ id: m.id, body: m.body, name: m.name, username: m.username, userId: m.userId, createdAt: m.createdAt.toISOString() })),
    reactions,
    here,
  });
});

shows.post("/shows/:id/chat", async (c) => {
  const id = c.req.param("id");
  const user = await requireUser(c);
  rateLimit(`chat:${user.id}`, 12, 30_000);
  const show = await getShow(id);
  if (!show || show.status !== "scheduled") throw new HttpError("Show not found", 404);
  // Only ticket holders (or free-show viewers) can talk, which keeps chat on-topic and spam-resistant.
  const ac = await accessCtx(user);
  if (!canAccess(ac, "show", show)) throw new HttpError("Get a ticket to join the chat", 403);
  const { body: text } = z.object({ body: z.string().trim().min(1).max(280) }).parse(await body(c));
  const db = await getDb();
  await db.insert(schema.chatMessages).values({ id: newId(), showId: id, userId: user.id, body: text });
  return c.json({ ok: true });
});

const Reaction = z.object({
  emoji: z.enum(REACTION_EMOJI),
  // Taps are batched client-side; the cap keeps one request from inflating the totals.
  n: z.number().int().min(1).max(12).default(1),
});

/** Anyone can react (it is lightweight and anonymous), but it is rate limited per client. */
shows.post("/shows/:id/reactions", async (c) => {
  const id = c.req.param("id");
  rateLimit(`react:${id}:${clientIp(c)}`, 40, 10_000);
  const { emoji, n } = Reaction.parse(await body(c));
  const show = await getShow(id);
  if (!show || show.status !== "scheduled") throw new HttpError("Show not found", 404);
  await addReactions(id, emoji, n);
  return c.json({ ok: true });
});
