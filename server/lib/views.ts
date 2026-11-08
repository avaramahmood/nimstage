// "Views": the data each page needs, assembled on the server with access rules already applied.
// In the Next version these were server components; in the SPA they are JSON endpoints. The one
// rule that matters most here: anything a viewer isn't allowed to see (locked post text, ...) is
// removed *before* the response is built, never hidden by the client.
import {
  accessCtx,
  canAccess,
  discover,
  getAdminData,
  getArtistById,
  getArtistByUser,
  getArtistPage,
  getHome,
  getLibrary,
  getPollsForArtist,
  getShow,
  getShowPage,
  getStudio,
  getTiers,
  getTrack,
  getTracksByArtist,
  ticketedShowsByTrack,
  type AccessCtx,
} from "./data";
import type { SessionUser } from "./session";
import { reconcileSoon } from "./payments";

export const homeView = () => getHome();
export const discoverView = (q: string) => discover(q);

export async function artistView(handle: string, ctx: AccessCtx) {
  const page = await getArtistPage(handle, ctx);
  if (!page) return null;
  const { artist, tracks, shows, posts, tiers, followers, following, supporter } = page;
  const [gating, polls] = await Promise.all([ticketedShowsByTrack(tracks.map((t) => t.id)), getPollsForArtist(artist.id, ctx, tiers)]);
  return {
    artist,
    own: ctx.ownArtistId === artist.id,
    tracks: tracks.map((t) => {
      const exclusive = (gating.get(t.id) ?? []).length > 0;
      return { id: t.id, title: t.title, coverKey: t.coverKey, durationSec: t.durationSec, previewSec: t.previewSec, priceLuna: t.priceLuna, exclusive, locked: !canAccess(ctx, "track", t, gating.get(t.id) ?? []) };
    }),
    shows,
    // Locked supporter-only posts are sent WITHOUT their text.
    posts: posts.map(({ post, locked }) => ({ id: post.id, tierId: post.tierId, createdAt: post.createdAt, locked, body: locked ? null : post.body })),
    tiers,
    polls: polls.map((p) => ({ id: p.id, question: p.question, status: p.status, tierName: p.tierName, options: p.options, total: p.total, myVote: p.myVote, canVote: p.canVote, reason: p.reason })),
    followers,
    following,
    supporter,
  };
}

export async function showView(id: string, ctx: AccessCtx) {
  const page = await getShowPage(id, ctx);
  if (!page) return null;
  return { show: page.show, track: page.track, access: page.access, own: ctx.ownArtistId === page.show.artistId, canChat: page.access && !!ctx.user };
}

/**
 * One track for its page: what it costs, whether this viewer already has it, and (for show-exclusive audio)
 * the show whose ticket unlocks it. The storage key of the file is deliberately not included.
 */
export async function trackView(id: string, ctx: AccessCtx) {
  const track = await getTrack(id);
  if (!track || track.status !== "published") return null;
  const artist = await getArtistById(track.artistId);
  if (!artist || artist.status !== "active") return null;
  const showIds = (await ticketedShowsByTrack([track.id])).get(track.id) ?? [];
  const show = showIds[0] ? await getShow(showIds[0]) : null;
  return {
    track: { id: track.id, title: track.title, artistId: track.artistId, durationSec: track.durationSec, previewSec: track.previewSec, priceLuna: track.priceLuna, coverKey: track.coverKey },
    artist: { id: artist.id, handle: artist.handle, name: artist.name, verified: artist.verified, avatarKey: artist.avatarKey },
    access: canAccess(ctx, "track", track, showIds),
    own: ctx.ownArtistId === track.artistId,
    exclusiveShow: show && show.status === "scheduled" ? { id: show.id, title: show.title } : null,
  };
}

export const libraryView = (userId: string) => getLibrary(userId);

export async function studioView(user: SessionUser) {
  const artist = await getArtistByUser(user.id);
  if (!artist) return { artist: null, studio: null, tracks: [], tiers: [] };
  await reconcileSoon({ artistId: artist.id }); // so earnings include payments the app missed
  const [studio, tracks, tiers] = await Promise.all([getStudio(artist), getTracksByArtist(artist.id), getTiers(artist.id)]);
  return { artist, studio, tracks, tiers };
}

export const adminView = () => getAdminData();

export { accessCtx };
