import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, rateLimit, requireUser } from "@srv/http";
import { accessCtx, getPollsForArtist, getTiers, pollEligibility } from "@srv/data";
import { getUser } from "@srv/session";

export const polls = new Hono();
const { polls: pollsT, pollOptions, pollVotes } = schema;

/** Current results for one poll, as seen by the signed-in viewer (includes their vote and whether they may vote). */
polls.get("/polls/:id", async (c) => {
  const id = c.req.param("id");
  const db = await getDb();
  const [poll] = await db.select().from(pollsT).where(eq(pollsT.id, id)).limit(1);
  if (!poll || poll.status === "removed") throw new HttpError("Poll not found", 404);
  const ac = await accessCtx(await getUser(c));
  const [view] = (await getPollsForArtist(poll.artistId, ac, await getTiers(poll.artistId))).filter((p) => p.id === id);
  if (!view) throw new HttpError("Poll not found", 404);
  return c.json({ poll: view });
});

/** One vote per fan per poll. Voting again changes your vote. Tier-gated polls need that tier. */
polls.post("/polls/:id/vote", async (c) => {
  const id = c.req.param("id");
  const user = await requireUser(c);
  rateLimit(`vote:${user.id}`, 30, 60_000);
  const { optionId } = z.object({ optionId: z.string().max(64) }).parse(await body(c));

  const db = await getDb();
  const [poll] = await db.select().from(pollsT).where(eq(pollsT.id, id)).limit(1);
  if (!poll) throw new HttpError("Poll not found", 404);
  const [option] = await db.select().from(pollOptions).where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, id))).limit(1);
  if (!option) throw new HttpError("That option isn't part of this poll");

  const elig = pollEligibility(await accessCtx(user), poll, await getTiers(poll.artistId));
  if (!elig.ok) throw new HttpError(elig.reason ?? "You can't vote on this poll", 403);

  await db
    .insert(pollVotes)
    .values({ pollId: id, userId: user.id, optionId })
    .onConflictDoUpdate({ target: [pollVotes.pollId, pollVotes.userId], set: { optionId, createdAt: new Date() } });
  return c.json({ ok: true });
});
