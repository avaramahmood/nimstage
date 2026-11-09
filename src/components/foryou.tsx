import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import { Radio, X } from "lucide-react";
import { Link } from "@/components/link";
import { Cover, Reveal, SectionTitle } from "@/components/ui";
import { PlayToggle } from "@/components/player-ui";
import { ShowPoster } from "@/components/show-card";
import { dismissedLive, dismissLive, useForYou, useMarkSeen } from "@/lib/foryou";
import { useWallet } from "@/lib/wallet";
import { usePathname } from "@/lib/nav";
import { fmtWhen } from "@shared/format";
import { formatNim } from "@shared/units";

/** The row on Home, right under the hero record: live first, then coming up, then new tracks and posts. */
export function ForYouRow() {
  const { me } = useWallet();
  const q = useForYou();
  const markSeen = useMarkSeen();
  const data = q.data;
  const has = !!data && data.live.length + data.upcoming.length + data.tracks.length + data.posts.length > 0;

  // Looking at the row counts as having seen what is new (the dot on Me clears).
  useEffect(() => {
    if (!has || !data?.fresh) return;
    const t = setTimeout(markSeen, 2500);
    return () => clearTimeout(t);
  }, [has, data?.fresh, markSeen]);

  if (!me?.user || !data) return null;
  if (data.following === 0) {
    return (
      <Reveal>
        <div className="card flex items-center justify-between gap-4 p-5">
          <div>
            <p className="display display-sm">Your artists, first</p>
            <p className="mt-1 text-muted">Follow artists and their live shows, new tracks and posts show up here before anything else.</p>
          </div>
          <Link href="/discover" className="btn btn-primary btn-sm shrink-0">Find artists</Link>
        </div>
      </Reveal>
    );
  }
  if (!has) return null;
  return (
    <Reveal>
      <SectionTitle>For you</SectionTitle>
      <div className="rail">
        {data.live.map((s) => <ShowPoster key={s.id} show={s} />)}
        {data.upcoming.slice(0, 6).map((s) => <ShowPoster key={s.id} show={s} />)}
        {data.tracks.map(({ track, artist }) => (
          <div key={track.id} className="card w-[260px] overflow-hidden md:w-auto">
            <div className="relative">
              <Link href={`/track/${track.id}`} aria-label={`${track.title}: open track page`} className="block">
                <Cover seed={track.id} image={track.coverKey} className="aspect-[4/3] w-full" />
              </Link>
              <span className="sticker sticker-cream absolute left-3 top-3">New track</span>
              <div className="absolute bottom-2 right-2 z-10">
                <PlayToggle track={{ id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, cover: track.coverKey, durationSec: track.durationSec, previewSec: track.previewSec }} />
              </div>
            </div>
            <div className="p-4">
              <Link href={`/track/${track.id}`} className="display display-sm line-clamp-2 min-h-[46px]">{track.title}</Link>
              <Link href={`/artist/${artist.handle}`} className="mt-2 block truncate text-sm text-muted">{artist.name}</Link>
              <p className="mt-1 font-mono text-xs text-muted">{formatNim(track.priceLuna)}</p>
            </div>
          </div>
        ))}
        {data.posts.map(({ post, artist }) => (
          <Link key={post.id} href={`/artist/${artist.handle}`} className="lift card flex w-[260px] flex-col gap-3 p-4 md:w-auto">
            <span className="flex items-center gap-3">
              <Cover seed={`${artist.id}-avatar`} image={artist.avatarKey} className="h-10 w-10 rounded-full" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{artist.name}</span>
                <span className="block font-mono text-xs text-muted">Post · {fmtWhen(post.createdAt)}</span>
              </span>
            </span>
            <span className="line-clamp-4 break-words text-muted">{post.body}</span>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}

/** A banner at the top of every screen when someone you follow is live. Tap to join; the cross hides it for that show. */
export function LiveBanner() {
  const { me } = useWallet();
  const q = useForYou();
  const path = usePathname();
  const [gone, setGone] = useState<string[]>(() => dismissedLive());
  if (!me?.user) return null;
  const live = (q.data?.live ?? []).filter((s) => !gone.includes(s.id) && path !== `/show/${s.id}`);
  const s = live[0];
  if (!s || path.startsWith("/welcome") || path.startsWith("/signin")) return null;
  return (
    <div role="status" className="flex items-center gap-3 border-b border-accent/40 bg-accent/15 px-4 py-2.5">
      <Radio aria-hidden="true" size={18} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1 truncate">
        <strong>{s.artist.name}</strong> is live{live.length > 1 ? ` · +${live.length - 1} more` : ""}: {s.title}
      </p>
      <RouterLink to={`/show/${s.id}`} className="btn btn-primary btn-sm shrink-0">Join</RouterLink>
      <button
        type="button"
        aria-label="Hide this banner"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10"
        onClick={() => {
          dismissLive(s.id);
          setGone(dismissedLive());
        }}
      >
        <X aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

/** The card on Me: a short list of what is new since you last looked. */
export function UpdatesCard() {
  const q = useForYou();
  const markSeen = useMarkSeen();
  const d = q.data;
  useEffect(() => {
    if (!d?.fresh) return;
    const t = setTimeout(markSeen, 3000);
    return () => clearTimeout(t);
  }, [d?.fresh, markSeen]);
  if (!d || d.following === 0) return null;
  const lines: { key: string; href: string; text: string; tag: string }[] = [
    ...d.live.map((s) => ({ key: `l-${s.id}`, href: `/show/${s.id}`, text: `${s.artist.name} is live: ${s.title}`, tag: "Live" })),
    ...d.upcoming.slice(0, 3).map((s) => ({ key: `u-${s.id}`, href: `/show/${s.id}`, text: `${s.artist.name}: ${s.title}`, tag: fmtWhen(s.startsAt) })),
    ...d.tracks.slice(0, 3).map(({ track, artist }) => ({ key: `t-${track.id}`, href: `/track/${track.id}`, text: `${artist.name} released ${track.title}`, tag: "Track" })),
    ...d.posts.slice(0, 2).map(({ post, artist }) => ({ key: `p-${post.id}`, href: `/artist/${artist.handle}`, text: `${artist.name} posted: ${post.body.slice(0, 60)}`, tag: "Post" })),
  ];
  if (!lines.length) return null;
  return (
    <section aria-label="Updates from artists you follow" className="card mt-4 p-4">
      <h2 className="display display-sm">From artists you follow {d.fresh > 0 && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">{d.fresh} new</span>}</h2>
      <ul className="mt-2 divide-y divide-line">
        {lines.map((l) => (
          <li key={l.key}>
            <Link href={l.href} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate">{l.text}</span>
              <span className="shrink-0 font-mono text-xs text-muted">{l.tag}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
