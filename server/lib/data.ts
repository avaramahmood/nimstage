import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, ilike } from "drizzle-orm";
import { getDb, schema } from "@srv/db";
import type { SessionUser } from "@srv/session";
import { computePass, type PassStats } from "@shared/fanpass";

const { users, artists, tiers, tracks, shows, posts, follows, entitlements, chatMessages, reports, paymentIntents, showReactions, presence, polls, pollOptions, pollVotes } = schema;

export type Artist = typeof artists.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Tier = typeof tiers.$inferSelect;

export type ShowState = "upcoming" | "live" | "ended";

/** Browsable tracks: priced tracks, or free tracks that aren't the exclusive audio of a ticketed show. */
const standaloneTrack = or(
  gt(tracks.priceLuna, 0),
  sql`not exists (select 1 from shows s where s.track_id = ${tracks.id} and s.price_luna > 0 and s.status = 'scheduled')`,
);

export function showState(show: Pick<Show, "startsAt" | "durationMin">, now = new Date()): ShowState {
  const start = show.startsAt.getTime();
  const end = start + show.durationMin * 60_000;
  const t = now.getTime();
  return t < start ? "upcoming" : t < end ? "live" : "ended";
}

/* ------------------------------ lookups ------------------------------ */

export async function getArtistByUser(userId: string) {
  const db = await getDb();
  const [a] = await db.select().from(artists).where(eq(artists.userId, userId)).limit(1);
  return a ?? null;
}

export async function getArtistByHandle(handle: string) {
  const db = await getDb();
  const [a] = await db.select().from(artists).where(eq(artists.handle, handle.toLowerCase())).limit(1);
  return a ?? null;
}

export async function getArtistById(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  return a ?? null;
}

export async function listArtists(opts: { q?: string; limit?: number } = {}) {
  const db = await getDb();
  const where = opts.q
    ? and(eq(artists.status, "active"), or(ilike(artists.name, `%${opts.q}%`), ilike(artists.genre, `%${opts.q}%`), ilike(artists.handle, `%${opts.q}%`)))
    : eq(artists.status, "active");
  return db.select().from(artists).where(where).orderBy(desc(artists.verified), desc(artists.createdAt)).limit(opts.limit ?? 50);
}

export async function getTrack(id: string) {
  const db = await getDb();
  const [t] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  return t ?? null;
}

export async function getShow(id: string) {
  const db = await getDb();
  const [s] = await db.select().from(shows).where(eq(shows.id, id)).limit(1);
  return s ?? null;
}

export async function getTiers(artistId: string) {
  const db = await getDb();
  return db.select().from(tiers).where(eq(tiers.artistId, artistId)).orderBy(asc(tiers.priceLuna));
}

export async function getTracksByArtist(artistId: string, includeRemoved = false) {
  const db = await getDb();
  return db
    .select()
    .from(tracks)
    .where(includeRemoved ? eq(tracks.artistId, artistId) : and(eq(tracks.artistId, artistId), eq(tracks.status, "published")))
    .orderBy(desc(tracks.createdAt));
}

export async function getShowsByArtist(artistId: string) {
  const db = await getDb();
  return db
    .select()
    .from(shows)
    .where(and(eq(shows.artistId, artistId), eq(shows.status, "scheduled")))
    .orderBy(desc(shows.startsAt));
}

export async function getPostsByArtist(artistId: string) {
  const db = await getDb();
  return db.select().from(posts).where(and(eq(posts.artistId, artistId), eq(posts.status, "published"))).orderBy(desc(posts.createdAt)).limit(30);
}

/* ------------------------------ access ------------------------------ */

/** Active entitlements for a user (expired memberships filtered out). */
export async function activeEntitlements(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date()))));
}

export type AccessCtx = { user: SessionUser | null; ents: Awaited<ReturnType<typeof activeEntitlements>>; ownArtistId: string | null };

export async function accessCtx(user: SessionUser | null): Promise<AccessCtx> {
  if (!user) return { user: null, ents: [], ownArtistId: null };
  const [ents, own] = await Promise.all([activeEntitlements(user.id), getArtistByUser(user.id)]);
  return { user, ents, ownArtistId: own?.id ?? null };
}

export const isSupporter = (ctx: AccessCtx, artistId: string) =>
  ctx.ents.some((e) => e.kind === "tier" && e.artistId === artistId);

/**
 * Ids of ticketed shows that use each track as their audio. A track used by a paid show is
 * show-exclusive: being priced at 0 on its own must not bypass the ticket.
 */
export async function ticketedShowsByTrack(trackIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!trackIds.length) return map;
  const db = await getDb();
  const rows = await db
    .select({ id: shows.id, trackId: shows.trackId })
    .from(shows)
    .where(and(inArray(shows.trackId, trackIds), gt(shows.priceLuna, 0), eq(shows.status, "scheduled")));
  for (const r of rows) if (r.trackId) map.set(r.trackId, [...(map.get(r.trackId) ?? []), r.id]);
  return map;
}

/** Can this viewer play the full track / watch the full show? `exclusiveShows` = ticketed shows using this track. */
export function canAccess(
  ctx: AccessCtx,
  kind: "track" | "show",
  item: { id: string; artistId: string; priceLuna: number },
  exclusiveShows: string[] = [],
): boolean {
  if (item.priceLuna <= 0 && exclusiveShows.length === 0) return true;
  if (ctx.user?.role === "admin") return true;
  if (ctx.ownArtistId === item.artistId) return true;
  if (ctx.ents.some((e) => e.kind === kind && e.refId === item.id)) return true;
  if (exclusiveShows.some((sid) => ctx.ents.some((e) => e.kind === "show" && e.refId === sid))) return true;
  return isSupporter(ctx, item.artistId); // supporters get every show and track from that artist
}

/** Supporter-only posts require a tier priced at or above the post's tier. */
export function canViewPost(ctx: AccessCtx, post: Post, postTier: Tier | undefined, tiersOfArtist: Tier[]): boolean {
  if (!post.tierId) return true;
  if (ctx.user?.role === "admin" || ctx.ownArtistId === post.artistId) return true;
  const need = postTier?.priceLuna ?? 0;
  const owned = ctx.ents.filter((e) => e.kind === "tier" && e.artistId === post.artistId);
  return owned.some((e) => (tiersOfArtist.find((t) => t.id === e.refId)?.priceLuna ?? 0) >= need);
}

/* ------------------------------ composed views ------------------------------ */

export type ShowCardData = Show & { artist: Artist; state: ShowState; trackTitle: string | null };

async function withArtists(rows: Show[]): Promise<ShowCardData[]> {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = [...new Set(rows.map((s) => s.artistId))];
  const arts = await db.select().from(artists).where(inArray(artists.id, ids));
  const trackIds = rows.map((s) => s.trackId).filter((x): x is string => !!x);
  // Only published tracks: a taken-down track's title must not leak through the show that used it.
  const trs = trackIds.length ? await db.select().from(tracks).where(and(inArray(tracks.id, trackIds), eq(tracks.status, "published"))) : [];
  return rows
    .map((s) => {
      const artist = arts.find((a) => a.id === s.artistId);
      return artist ? { ...s, artist, state: showState(s), trackTitle: trs.find((t) => t.id === s.trackId)?.title ?? null } : null;
    })
    .filter((x): x is ShowCardData => !!x && x.artist.status === "active");
}

export async function getHome() {
  const db = await getDb();
  const since = new Date(Date.now() - 6 * 3600_000);
  // The three queries are independent: run them together.
  const [rows, recent, lineup] = await Promise.all([
    db.select().from(shows).where(and(eq(shows.status, "scheduled"), gt(shows.startsAt, since))).orderBy(asc(shows.startsAt)).limit(24),
    db
      .select({ track: tracks, artist: artists })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(and(eq(tracks.status, "published"), eq(artists.status, "active"), standaloneTrack))
      .orderBy(desc(tracks.createdAt))
      .limit(12),
    listArtists({ limit: 12 }),
  ]);
  const cards = (await withArtists(rows)).filter((s) => s.state !== "ended");
  const live = cards.filter((s) => s.state === "live");
  const upcoming = cards.filter((s) => s.state === "upcoming");
  return { live, upcoming, recent, lineup };
}

export async function getArtistPage(handle: string, ctx: AccessCtx) {
  const artist = await getArtistByHandle(handle);
  if (!artist || (artist.status !== "active" && ctx.user?.role !== "admin" && ctx.ownArtistId !== artist.id)) return null;
  const db = await getDb();
  const [tr, sh, ps, ti, [fc]] = await Promise.all([
    getTracksByArtist(artist.id),
    getShowsByArtist(artist.id),
    getPostsByArtist(artist.id),
    getTiers(artist.id),
    db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.artistId, artist.id)),
  ]);
  const following = ctx.user
    ? !!(await db.select().from(follows).where(and(eq(follows.userId, ctx.user.id), eq(follows.artistId, artist.id))).limit(1))[0]
    : false;
  const showCards = (await withArtists(sh)).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return {
    artist,
    tracks: tr,
    shows: showCards,
    posts: ps.map((p) => ({ post: p, locked: !canViewPost(ctx, p, ti.find((t) => t.id === p.tierId), ti) })),
    tiers: ti,
    followers: fc?.n ?? 0,
    following,
    supporter: isSupporter(ctx, artist.id),
  };
}

export async function getShowPage(id: string, ctx: AccessCtx) {
  const show = await getShow(id);
  if (!show || (show.status !== "scheduled" && ctx.user?.role !== "admin")) return null;
  const [card] = await withArtists([show]);
  if (!card) return null;
  const found = show.trackId ? await getTrack(show.trackId) : null;
  const track = found && found.status === "published" ? found : null; // a taken-down track is not offered
  const access = canAccess(ctx, "show", show);
  return { show: card, track, access };
}

export async function getLibrary(userId: string) {
  const db = await getDb();
  const ents = await activeEntitlements(userId);
  const showIds = ents.filter((e) => e.kind === "show").map((e) => e.refId);
  const trackIds = ents.filter((e) => e.kind === "track").map((e) => e.refId);
  const tierEnts = ents.filter((e) => e.kind === "tier");
  const [sh, tr, tierRows, fl] = await Promise.all([
    showIds.length ? db.select().from(shows).where(inArray(shows.id, showIds)) : [],
    trackIds.length ? db.select({ track: tracks, artist: artists }).from(tracks).innerJoin(artists, eq(tracks.artistId, artists.id)).where(inArray(tracks.id, trackIds)) : [],
    tierEnts.length ? db.select().from(tiers).where(inArray(tiers.id, tierEnts.map((e) => e.refId))) : [],
    db.select({ artist: artists }).from(follows).innerJoin(artists, eq(follows.artistId, artists.id)).where(eq(follows.userId, userId)),
  ]);
  const supporting = await Promise.all(
    tierEnts.map(async (e) => ({ ent: e, tier: tierRows.find((t) => t.id === e.refId), artist: await getArtistById(e.artistId) })),
  );
  return {
    shows: (await withArtists(sh)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    tracks: tr,
    supporting: supporting.filter((s) => s.artist && s.tier),
    following: fl.map((f) => f.artist),
  };
}

export async function discover(q: string) {
  const db = await getDb();
  const [arts, trs, shs] = await Promise.all([
    listArtists({ q, limit: 20 }),
    db
      .select({ track: tracks, artist: artists })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(and(eq(tracks.status, "published"), eq(artists.status, "active"), standaloneTrack, q ? ilike(tracks.title, `%${q}%`) : undefined))
      .orderBy(desc(tracks.plays))
      .limit(20),
    db.select().from(shows).where(and(eq(shows.status, "scheduled"), q ? ilike(shows.title, `%${q}%`) : undefined)).orderBy(asc(shows.startsAt)).limit(20),
  ]);
  return { artists: arts, tracks: trs, shows: (await withArtists(shs)).filter((s) => s.state !== "ended") };
}

/* ------------------------------ studio ------------------------------ */

export async function getStudio(artist: Artist) {
  const db = await getDb();
  const [tr, sh, ps, ti] = await Promise.all([
    getTracksByArtist(artist.id, true),
    getShowsByArtist(artist.id),
    getPostsByArtist(artist.id),
    getTiers(artist.id),
  ]);
  const paid = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.artistId, artist.id), eq(paymentIntents.status, "confirmed")))
    .orderBy(desc(paymentIntents.confirmedAt))
    .limit(200);
  const sum = (k: string) => paid.filter((p) => p.kind === k).reduce((n, p) => n + p.amountLuna, 0);
  const supporters = await db
    .select({ n: sql<number>`count(distinct ${entitlements.userId})::int` })
    .from(entitlements)
    .where(and(eq(entitlements.artistId, artist.id), eq(entitlements.kind, "tier"), or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date()))));
  const [fc] = await db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.artistId, artist.id));
  const pollRows = await db
    .select()
    .from(polls)
    .where(and(eq(polls.artistId, artist.id), or(eq(polls.status, "open"), eq(polls.status, "closed"))))
    .orderBy(desc(polls.createdAt))
    .limit(20);
  const pollCounts = pollRows.length
    ? await db
        .select({ pollId: pollVotes.pollId, n: sql<number>`count(*)::int` })
        .from(pollVotes)
        .where(inArray(pollVotes.pollId, pollRows.map((p) => p.id)))
        .groupBy(pollVotes.pollId)
    : [];
  return {
    tracks: tr,
    shows: await withArtists(sh),
    posts: ps,
    polls: pollRows.map((p) => ({ ...p, votes: pollCounts.find((c) => c.pollId === p.id)?.n ?? 0 })),
    tiers: ti,
    earnings: { total: paid.reduce((n, p) => n + p.amountLuna, 0), tickets: sum("ticket") + sum("track"), tips: sum("tip"), memberships: sum("membership") },
    recent: paid.slice(0, 8),
    supporters: supporters[0]?.n ?? 0,
    followers: fc?.n ?? 0,
  };
}

/* ------------------------------ admin ------------------------------ */

export async function getAdminData() {
  const db = await getDb();
  const open = await db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)).limit(100);
  const arts = await db.select().from(artists).orderBy(desc(artists.createdAt)).limit(100);
  return { reports: open, artists: arts };
}

/* ------------------------------ chat ------------------------------ */

export async function getChat(showId: string, afterIso?: string) {
  const db = await getDb();
  const since = afterIso ? new Date(afterIso) : new Date(0);
  const rows = await db
    .select({ id: chatMessages.id, body: chatMessages.body, createdAt: chatMessages.createdAt, name: users.displayName, username: users.username, userId: users.id })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(and(eq(chatMessages.showId, showId), gt(chatMessages.createdAt, since)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(60);
  return rows.reverse();
}

/* ------------------------------ live room: reactions + presence ------------------------------ */

export const REACTION_EMOJI = ["🔥", "❤️", "👏", "🎸"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];
const PRESENCE_WINDOW_MS = 45_000;

export async function addReactions(showId: string, emoji: ReactionEmoji, n: number) {
  const db = await getDb();
  await db
    .insert(showReactions)
    .values({ showId, emoji, count: n })
    .onConflictDoUpdate({ target: [showReactions.showId, showReactions.emoji], set: { count: sql`${showReactions.count} + ${n}` } });
}

export async function getReactions(showId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.select().from(showReactions).where(eq(showReactions.showId, showId));
  const out: Record<string, number> = Object.fromEntries(REACTION_EMOJI.map((e) => [e, 0]));
  for (const r of rows) out[r.emoji] = r.count;
  return out;
}

/** Marks a client as present and returns how many distinct clients were seen in the last 45 s. */
export async function touchPresence(showId: string, cid: string): Promise<number> {
  const db = await getDb();
  const now = new Date();
  await db.insert(presence).values({ showId, cid, lastSeen: now }).onConflictDoUpdate({ target: [presence.showId, presence.cid], set: { lastSeen: now } });
  if (Math.random() < 0.02) await db.delete(presence).where(lt(presence.lastSeen, new Date(now.getTime() - 3_600_000))); // tidy up occasionally
  return hereNow(showId);
}

export async function hereNow(showId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(presence)
    .where(and(eq(presence.showId, showId), gt(presence.lastSeen, new Date(Date.now() - PRESENCE_WINDOW_MS))));
  return row?.n ?? 0;
}

/* ------------------------------ polls ------------------------------ */

export type PollView = {
  id: string;
  question: string;
  status: string;
  tierName: string | null;
  options: { id: string; label: string; votes: number }[];
  total: number;
  myVote: string | null;
  canVote: boolean;
  /** Why the viewer can't vote right now (shown instead of the vote buttons). */
  reason: string | null;
  createdAt: Date;
};

/** Who may vote: open poll, signed in, not the artist, and (if the poll is tier-gated) a supporter at that tier or higher. */
export function pollEligibility(
  ctx: AccessCtx,
  poll: Pick<typeof polls.$inferSelect, "artistId" | "status" | "tierId">,
  artistTiers: Tier[],
): { ok: boolean; reason: string | null } {
  if (poll.status !== "open") return { ok: false, reason: "This poll is closed." };
  if (!ctx.user) return { ok: false, reason: "Sign in to vote." };
  if (ctx.ownArtistId === poll.artistId) return { ok: false, reason: "Your fans vote on this." };
  if (poll.tierId) {
    const need = artistTiers.find((t) => t.id === poll.tierId);
    const have = ctx.ents.filter((e) => e.kind === "tier" && e.artistId === poll.artistId);
    const ok = !!need && have.some((e) => (artistTiers.find((t) => t.id === e.refId)?.priceLuna ?? 0) >= need.priceLuna);
    if (!ok) return { ok: false, reason: `Supporters at “${need?.name ?? "a tier"}” and above can vote.` };
  }
  return { ok: true, reason: null };
}

export async function getPollsForArtist(artistId: string, ctx: AccessCtx, tiersOfArtist: Tier[]): Promise<PollView[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(polls)
    .where(and(eq(polls.artistId, artistId), or(eq(polls.status, "open"), eq(polls.status, "closed"))))
    .orderBy(desc(polls.createdAt))
    .limit(5);
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const [opts, counts, mine] = await Promise.all([
    db.select().from(pollOptions).where(inArray(pollOptions.pollId, ids)).orderBy(asc(pollOptions.position)),
    db
      .select({ optionId: pollVotes.optionId, n: sql<number>`count(*)::int` })
      .from(pollVotes)
      .where(inArray(pollVotes.pollId, ids))
      .groupBy(pollVotes.optionId),
    ctx.user ? db.select().from(pollVotes).where(and(inArray(pollVotes.pollId, ids), eq(pollVotes.userId, ctx.user.id))) : Promise.resolve([]),
  ]);
  return rows.map((p) => {
    const options = opts.filter((o) => o.pollId === p.id).map((o) => ({ id: o.id, label: o.label, votes: counts.find((c) => c.optionId === o.id)?.n ?? 0 }));
    const elig = pollEligibility(ctx, p, tiersOfArtist);
    return {
      id: p.id,
      question: p.question,
      status: p.status,
      tierName: p.tierId ? (tiersOfArtist.find((t) => t.id === p.tierId)?.name ?? null) : null,
      options,
      total: options.reduce((n, o) => n + o.votes, 0),
      myVote: mine.find((m) => m.pollId === p.id)?.optionId ?? null,
      canVote: elig.ok,
      reason: elig.reason,
      createdAt: p.createdAt,
    };
  });
}

/* ------------------------------ fan pass ------------------------------ */

export async function getPassStats(userId: string): Promise<PassStats> {
  const db = await getDb();
  const n = sql<number>`count(*)::int`;
  const [tickets, trackBuys, memberships, tips, follows_, messages, votes] = await Promise.all([
    db.select({ n }).from(entitlements).where(and(eq(entitlements.userId, userId), eq(entitlements.kind, "show"))),
    db.select({ n }).from(entitlements).where(and(eq(entitlements.userId, userId), eq(entitlements.kind, "track"))),
    db
      .select({ n })
      .from(entitlements)
      .where(and(eq(entitlements.userId, userId), eq(entitlements.kind, "tier"), or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())))),
    db.select({ n }).from(paymentIntents).where(and(eq(paymentIntents.userId, userId), eq(paymentIntents.kind, "tip"), eq(paymentIntents.status, "confirmed"))),
    db.select({ n }).from(follows).where(eq(follows.userId, userId)),
    db.select({ n }).from(chatMessages).where(eq(chatMessages.userId, userId)),
    db.select({ n }).from(pollVotes).where(eq(pollVotes.userId, userId)),
  ]);
  return {
    tickets: tickets[0]?.n ?? 0,
    tracks: trackBuys[0]?.n ?? 0,
    memberships: memberships[0]?.n ?? 0,
    tips: tips[0]?.n ?? 0,
    follows: follows_[0]?.n ?? 0,
    messages: messages[0]?.n ?? 0,
    votes: votes[0]?.n ?? 0,
  };
}

export async function getFanPass(userId: string) {
  return computePass(await getPassStats(userId));
}

/* ------------------------------ discovery ------------------------------ */

export async function randomArtistHandle(): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select({ handle: artists.handle }).from(artists).where(eq(artists.status, "active")).orderBy(sql`random()`).limit(1);
  return row?.handle ?? null;
}
