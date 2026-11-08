import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, requireAdmin } from "@srv/http";

export const admin = new Hono();

admin.get("/admin/reports", async (c) => {
  await requireAdmin(c);
  const db = await getDb();
  return c.json({ reports: await db.select().from(schema.reports).where(eq(schema.reports.status, "open")) });
});

admin.post("/admin/reports", async (c) => {
  await requireAdmin(c);
  const { id, action } = z.object({ id: z.string().max(64), action: z.enum(["dismiss", "takedown"]) }).parse(await body(c));
  const db = await getDb();
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.id, id)).limit(1);
  if (!report) throw new HttpError("Report not found", 404);

  if (action === "takedown") {
    const k = report.targetKind;
    if (k === "track") await db.update(schema.tracks).set({ status: "removed" }).where(eq(schema.tracks.id, report.targetId));
    else if (k === "show") await db.update(schema.shows).set({ status: "removed" }).where(eq(schema.shows.id, report.targetId));
    else if (k === "post") await db.update(schema.posts).set({ status: "removed" }).where(eq(schema.posts.id, report.targetId));
    else await db.update(schema.artists).set({ status: "suspended" }).where(eq(schema.artists.id, report.targetId));
  }
  await db.update(schema.reports).set({ status: action === "takedown" ? "actioned" : "dismissed" }).where(eq(schema.reports.id, id));
  return c.json({ ok: true });
});

admin.post("/admin/artists", async (c) => {
  await requireAdmin(c);
  const b = z.object({ id: z.string().max(64), verified: z.boolean().optional(), suspended: z.boolean().optional() }).parse(await body(c));
  const db = await getDb();
  const patch: Partial<typeof schema.artists.$inferInsert> = {};
  if (b.verified !== undefined) patch.verified = b.verified;
  if (b.suspended !== undefined) patch.status = b.suspended ? "suspended" : "active";
  if (Object.keys(patch).length) await db.update(schema.artists).set(patch).where(eq(schema.artists.id, b.id));
  return c.json({ ok: true });
});
