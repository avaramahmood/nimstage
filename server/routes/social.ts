import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { body, rateLimit, requireUser } from "@srv/http";
import { newId } from "@srv/ids";

export const social = new Hono();

social.post("/follow", async (c) => {
  const user = await requireUser(c);
  const { artistId } = z.object({ artistId: z.string().max(64) }).parse(await body(c));
  const db = await getDb();
  const where = and(eq(schema.follows.userId, user.id), eq(schema.follows.artistId, artistId));
  const [existing] = await db.select().from(schema.follows).where(where).limit(1);
  if (existing) await db.delete(schema.follows).where(where);
  else await db.insert(schema.follows).values({ userId: user.id, artistId });
  return c.json({ following: !existing });
});

const Report = z.object({
  targetKind: z.enum(["track", "show", "artist", "post"]),
  targetId: z.string().max(64),
  reason: z.enum(["copyright", "explicit", "scam", "spam", "other"]),
  note: z.string().max(300).optional(),
});

// "Report" is also the takedown path for music the uploader doesn't own.
social.post("/reports", async (c) => {
  const user = await requireUser(c);
  rateLimit(`report:${user.id}`, 10, 60_000);
  const b = Report.parse(await body(c));
  const db = await getDb();
  await db.insert(schema.reports).values({ id: newId(), reporterId: user.id, targetKind: b.targetKind, targetId: b.targetId, reason: b.note ? `${b.reason}: ${b.note}` : b.reason });
  return c.json({ ok: true });
});
