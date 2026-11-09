// "For you": what artists the user follows are doing, so the app can show it first (home row, live banner, the dot on Me).
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@srv/db";
import { getShowCards, standaloneTrack } from "./data";

const { artists, tracks, shows, posts, follows } = schema;

/** Only what a card needs about an artist: no internal ids or payout details. */
const slim = (a: typeof artists.$inferSelect) => ({ id: a.id, handle: a.handle, name: a.name, genre: a.genre, avatarKey: a.avatarKey, verified: a.verified });

/**
 * Live and upcoming shows, new tracks and public posts from the artists a user follows. `since` is when they last looked:
 * `fresh` counts what is new after it: shows that went live or were scheduled, new tracks and public posts. Supporter-only posts are left out entirely.
 */
export async function getForYou(userId: string, since?: Date) {
  const db = await getDb();
  const followed = await db
    .select({ id: artists.id })
    .from(follows)
    .innerJoin(artists, eq(follows.artistId, artists.id))
    .where(and(eq(follows.userId, userId), eq(artists.status, "active")));
  const ids = followed.map((f) => f.id);
  if (!ids.length) return { following: 0, ids, live: [], upcoming: [], tracks: [], posts: [], fresh: 0 };

  const recentStart = new Date(Date.now() - 6 * 3600_000);
  const [showRows, trackRows, postRows] = await Promise.all([
    db
      .select()
      .from(shows)
      .where(and(inArray(shows.artistId, ids), eq(shows.status, "scheduled"), gt(shows.startsAt, recentStart)))
      .orderBy(shows.startsAt)
      .limit(16),
    db
      .select({ track: tracks, artist: artists })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(and(inArray(tracks.artistId, ids), eq(tracks.status, "published"), eq(artists.status, "active"), standaloneTrack))
      .orderBy(desc(tracks.createdAt))
      .limit(8),
    db
      .select({ post: posts, artist: artists })
      .from(posts)
      .innerJoin(artists, eq(posts.artistId, artists.id))
      .where(and(inArray(posts.artistId, ids), eq(posts.status, "published"), isNull(posts.tierId), eq(artists.status, "active")))
      .orderBy(desc(posts.createdAt))
      .limit(6),
  ]);
  const cards = (await getShowCards(showRows)).filter((s) => s.state !== "ended");
  const live = cards.filter((s) => s.state === "live");
  const upcoming = cards.filter((s) => s.state === "upcoming");
  const after = (d: Date) => !!since && d > since;
  const fresh = live.filter((s) => after(s.startsAt)).length + upcoming.filter((s) => after(s.createdAt)).length + trackRows.filter((t) => after(t.track.createdAt)).length + postRows.filter((p) => after(p.post.createdAt)).length;
  return {
    following: ids.length,
    ids,
    live,
    upcoming,
    tracks: trackRows.map(({ track, artist }) => ({ track, artist: slim(artist) })),
    posts: postRows.map(({ post, artist }) => ({ post: { id: post.id, body: post.body, createdAt: post.createdAt }, artist: slim(artist) })),
    fresh,
  };
}

