import { useMemo } from "react";
import { BadgeCheck } from "lucide-react";
import { Link } from "@/components/link";
import { ShowHero, ShowPoster } from "@/components/show-card";
import { Cover, EmptyState, Reveal, SectionTitle } from "@/components/ui";
import { PlayToggle } from "@/components/player-ui";
import { SurpriseButton } from "@/components/surprise";
import { stateOf } from "@/components/page-state";
import { Stage } from "@/stage/stage";
import { useHome } from "@/lib/queries";
import { useNow, useTitle } from "@/lib/use-now";
import { showState } from "@shared/showstate";
import { formatNim } from "@shared/units";

export default function HomePage() {
  useTitle("");
  const q = useHome();
  const now = useNow();

  // Live/upcoming is recomputed on the client every few seconds, so a show that just started or
  // ended moves between sections without a reload.
  const { hero, rest } = useMemo(() => {
    const all = [...(q.data?.live ?? []), ...(q.data?.upcoming ?? [])].filter((s) => showState(s, now) !== "ended");
    all.sort((a, b) => Number(showState(b, now) === "live") - Number(showState(a, now) === "live") || +new Date(a.startsAt) - +new Date(b.startsAt));
    return { hero: all[0], rest: all.slice(1) };
  }, [q.data, now]);

  const state = stateOf(q);
  if (state) return state;
  const { recent, lineup } = q.data!;

  return (
    <div className="wrap grid gap-12 pt-6 md:pt-8">
      {hero ? <ShowHero show={hero} /> : <EmptyState title="Quiet night" body="No shows are scheduled yet. Artists can open the Studio tab to schedule the first one." />}

      <Stage artists={lineup} tracks={recent} />

      {rest.length > 0 && (
        <Reveal>
          <SectionTitle>Live &amp; coming up</SectionTitle>
          <div className="rail">{rest.map((s) => <ShowPoster key={s.id} show={s} />)}</div>
        </Reveal>
      )}

      <section aria-labelledby="artists">
        <SectionTitle
          action={
            <span className="flex items-center gap-4 text-sm">
              <SurpriseButton variant="link" />
              <Link href="/discover" className="text-muted underline underline-offset-4">See all</Link>
            </span>
          }
        >
          <span id="artists">Artists</span>
        </SectionTitle>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {lineup.map((a, i) => (
            <li key={a.id}>
              <Reveal index={i}>
                <Link href={`/artist/${a.handle}`} className="lift card flex flex-col items-center gap-3 p-5 text-center">
                  <Cover seed={a.id} className="h-20 w-20 rounded-full ring-1 ring-white/10 md:h-24 md:w-24" />
                  <span className="w-full min-w-0">
                    <span className="display display-sm flex items-center justify-center gap-1.5">
                      <span className="truncate">{a.name}</span>
                      {a.verified && <BadgeCheck aria-label="Verified artist" size={16} className="shrink-0 text-blue" />}
                    </span>
                    <span className="block text-sm text-muted">{a.genre}</span>
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="fresh">
          <SectionTitle>
            <span id="fresh">Fresh tracks</span>
          </SectionTitle>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {recent.map(({ track, artist }) => (
              <li key={track.id} className="min-w-0">
                <div className="relative">
                  <Cover seed={track.id} className="aspect-square w-full rounded-[20px]" />
                  <div className="absolute bottom-2 right-2 z-10">
                    <PlayToggle track={{ id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, durationSec: track.durationSec, previewSec: track.previewSec }} />
                  </div>
                </div>
                <p className="mt-2 truncate font-medium">{track.title}</p>
                <Link href={`/artist/${artist.handle}`} className="block truncate text-sm text-muted">{artist.name}</Link>
                <p className="font-mono text-xs text-muted">{formatNim(track.priceLuna)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-line pt-6 text-sm text-muted">
        <p>Artists keep every NIM they earn. Open source under MIT.</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/about" className="underline underline-offset-4">About</Link>
          <Link href="/help" className="underline underline-offset-4">Help</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
          <Link href="/policy" className="underline underline-offset-4">Content &amp; rights</Link>
        </p>
      </footer>
    </div>
  );
}
