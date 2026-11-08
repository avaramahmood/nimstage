import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@srv/db";
import { getMediaUser } from "@srv/session";
import { accessCtx, canAccess, getShow, getTrack, ticketedShowsByTrack } from "@srv/data";
import { mediaSize, openMedia } from "@srv/storage";
import { ensureDemoMedia } from "@srv/seed";

export const media = new Hono();

/**
 * Gated audio. Everyone can stream a short preview; the full file is only served to ticket/track
 * owners, supporters, the artist, or admins. Range requests are honoured so scrubbing works, and
 * the preview is enforced here on the server, not in the player.
 */
media.get("/tracks/:id/stream", async (c) => {
  const id = c.req.param("id");
  const track = await getTrack(id);
  if (!track || track.status !== "published") return c.text("Not found", 404);

  const ac = await accessCtx(await getMediaUser(c));
  const exclusive = (await ticketedShowsByTrack([track.id])).get(track.id) ?? [];
  let full = canAccess(ac, "track", track, exclusive);
  const showId = c.req.query("show");
  if (!full && showId) {
    // A premiere's audio is unlocked by the show ticket, not the track purchase.
    const show = await getShow(showId);
    if (show && show.trackId === track.id && show.status === "scheduled") full = canAccess(ac, "show", show);
  }

  let total = await mediaSize(track.mediaKey);
  if (!total) {
    await ensureDemoMedia(track.mediaKey); // demo tracks are synthesized on first play
    total = await mediaSize(track.mediaKey);
  }
  if (!total) return c.text("Media missing", 404);
  const allowed = full ? total : Math.max(1024, Math.min(total, Math.floor((total * track.previewSec) / Math.max(track.durationSec, 1))));

  const m = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
  let start = 0;
  let end = allowed - 1;
  if (m) {
    if (m[1] !== "") start = Number(m[1]);
    if (m[2] !== "") end = Math.min(Number(m[2]), allowed - 1);
    else if (m[1] === "") return c.text("Bad range", 416);
  }
  if (start > end || start >= allowed) return c.text("Range not satisfiable", 416, { "content-range": `bytes */${allowed}` });

  if (start === 0 && full) {
    const db = await getDb();
    void db.update(schema.tracks).set({ plays: sql`${schema.tracks.plays} + 1` }).where(eq(schema.tracks.id, track.id));
  }

  return new Response(await openMedia(track.mediaKey, start, end), {
    status: m ? 206 : 200,
    headers: {
      "content-type": track.mime,
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      ...(m ? { "content-range": `bytes ${start}-${end}/${allowed}` } : {}),
      "cache-control": "private, no-store",
      "x-nimstage-access": full ? "full" : "preview",
    },
  });
});
