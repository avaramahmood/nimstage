import { useParams } from "react-router";
import { BadgeCheck, Lock } from "lucide-react";
import { Cover, EmptyState, SectionTitle } from "@/components/ui";
import { BuyButton, TipButton } from "@/components/pay";
import { TrackRow } from "@/components/player-ui";
import { ShowPoster } from "@/components/show-card";
import { FollowButton, ReportButton } from "@/components/social";
import { PollCard } from "@/components/poll-card";
import { ShareButton } from "@/components/share-actions";
import { stateOf } from "@/components/page-state";
import { useArtist } from "@/lib/queries";
import { useTitle } from "@/lib/use-now";
import type { PlayerTrack } from "@/lib/player";
import { fmtWhen } from "@shared/format";
import { formatNim } from "@shared/units";

export default function ArtistPage() {
  const { handle = "" } = useParams();
  const q = useArtist(handle);
  useTitle(q.data ? q.data.artist.name : `@${handle}`);

  const state = stateOf(q);
  if (state) return state;
  const { artist, own, tracks, shows, posts, tiers, polls, followers, following, supporter } = q.data!;

  // Playing any track queues the whole list, so the next one starts when it ends.
  const queue: PlayerTrack[] = tracks.map((t) => ({ id: t.id, title: t.title, artist: artist.name, artistHandle: artist.handle, seed: t.id, durationSec: t.durationSec, previewSec: t.previewSec }));

  return (
    <article className="wrap pt-6 md:pt-8">
      <header className="card overflow-hidden">
        <div className="relative">
          <Cover seed={artist.id} className="h-44 w-full sm:h-60" />
          {artist.status !== "active" && <p className="sticker absolute left-4 top-4 z-10">Suspended</p>}
        </div>
        <div className="flex flex-col gap-5 px-6 pb-6 sm:px-8 sm:pb-8 md:flex-row md:items-end">
          <Cover seed={`${artist.id}-avatar`} className="-mt-14 h-28 w-28 shrink-0 rounded-full ring-4 ring-surface sm:-mt-16 sm:h-32 sm:w-32" />
          <div className="min-w-0 flex-1">
            <p className="label">
              {artist.genre} · {followers} {followers === 1 ? "follower" : "followers"}
            </p>
            <h1 className="display display-lg flex flex-wrap items-center gap-2 break-words">
              {artist.name}
              {artist.verified && <BadgeCheck aria-label="Verified artist" size={28} className="text-blue" />}
            </h1>
            {artist.bio && <p className="mt-2 max-w-[60ch] text-muted">{artist.bio}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!own && <FollowButton artistId={artist.id} initial={following} />}
            {!own && <TipButton target={artist.id} artistName={artist.name} className="btn btn-blue btn-sm" />}
            <ShareButton title={artist.name} text={`${artist.name} on NimStage: tickets, premieres and fan memberships`} path={`/artist/${artist.handle}`} />
            {supporter && <span className="sticker sticker-blue">Supporter</span>}
            <ReportButton targetKind="artist" targetId={artist.id} />
          </div>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        <div className="grid content-start gap-10">
          {polls.length > 0 && (
            <section aria-labelledby="polls">
              <SectionTitle>
                <span id="polls">Polls</span>
              </SectionTitle>
              <div className="grid gap-3">
                {polls.map((p) => (
                  <PollCard key={p.id} poll={p} />
                ))}
              </div>
            </section>
          )}

          {shows.length > 0 && (
            <section aria-labelledby="shows">
              <SectionTitle>
                <span id="shows">Shows</span>
              </SectionTitle>
              <div className="rail">{shows.map((s) => <ShowPoster key={s.id} show={s} />)}</div>
            </section>
          )}

          <section aria-labelledby="tracks">
            <SectionTitle>
              <span id="tracks">Tracks</span>
            </SectionTitle>
            {tracks.length === 0 ? (
              <EmptyState title="No tracks yet" body="Nothing has been uploaded." />
            ) : (
              <ol className="card p-2">
                {tracks.map((tr, i) => (
                  <TrackRow
                    key={tr.id}
                    index={i}
                    track={tr}
                    artist={artist}
                    priceLabel={tr.priceLuna <= 0 && tr.exclusive ? "Show audio" : formatNim(tr.priceLuna)}
                    locked={tr.locked}
                    queue={queue}
                    action={
                      tr.locked && !own && tr.priceLuna > 0 ? (
                        <BuyButton
                          className="btn btn-ghost btn-sm"
                          request={{ kind: "track", refId: tr.id }}
                          title={tr.title}
                          meta={artist.name}
                          priceLuna={tr.priceLuna}
                          label="Track"
                          cta="Buy"
                          doneText="Track unlocked."
                        />
                      ) : undefined
                    }
                  />
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="posts">
            <SectionTitle>
              <span id="posts">Posts</span>
            </SectionTitle>
            <ul className="grid gap-3">
              {posts.map((post) => {
                const tier = tiers.find((t) => t.id === post.tierId);
                return (
                  <li key={post.id} className="card p-5">
                    <p className="label mb-2 flex items-center gap-1.5">
                      {post.tierId ? (
                        <>
                          <Lock aria-hidden="true" size={12} /> {tier?.name ?? "Supporters"} only
                        </>
                      ) : (
                        "Public"
                      )}{" "}
                      · {fmtWhen(post.createdAt)}
                    </p>
                    {post.locked ? (
                      // The server never sends the text of a locked post, so there is nothing to reveal here.
                      <p aria-label="Supporter-only post, locked" className="select-none text-muted blur-[5px]">
                        This post is for supporters. Join a tier to read it and everything else this artist makes.
                      </p>
                    ) : (
                      <p className="whitespace-pre-line break-words">{post.body}</p>
                    )}
                    {post.locked && <p className="mt-3 text-sm text-blue">Join {tier ? `“${tier.name}”` : "a tier"} to unlock.</p>}
                  </li>
                );
              })}
              {posts.length === 0 && <EmptyState title="No posts yet" body="Check back soon." />}
            </ul>
          </section>
        </div>

        <aside aria-labelledby="tiers" className="lg:sticky lg:top-24 lg:self-start">
          <SectionTitle>
            <span id="tiers">Support</span>
          </SectionTitle>
          {tiers.length === 0 ? (
            <EmptyState title="No tiers yet" body="This artist hasn't set up fan memberships." />
          ) : (
            <ul className="grid gap-4">
              {tiers.map((t) => (
                <li key={t.id} className="ticket ticket-dark ring-1 ring-inset ring-white/10" style={{ ["--perf" as string]: "76px" }}>
                  <div className="flex h-[76px] items-start justify-between gap-3 p-5">
                    <p className="display display-sm">{t.name}</p>
                    <p className="display display-sm text-accent">{formatNim(t.priceLuna)}</p>
                  </div>
                  <div className="ticket-perf" />
                  <div className="p-5">
                    <p className="text-muted">{t.perks}</p>
                    {!own && (
                      <BuyButton
                        className="btn btn-primary btn-sm mt-4"
                        request={{ kind: "membership", refId: t.id }}
                        title={`${artist.name}: ${t.name}`}
                        meta="30 days of support"
                        priceLuna={t.priceLuna}
                        label="Membership"
                        cta={supporter ? "Renew · 30 more days" : "Join · 30 days"}
                        doneText="You're a supporter. Thank you!"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </article>
  );
}
