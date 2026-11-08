import { ArrowUpRight, Ticket } from "lucide-react";
import { Link } from "@/components/link";
import { Cover, LiveSticker } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { Vinyl } from "@/components/depth";
import { HeroDisc } from "@/stage/stage";
import { coverColors, fmtWhen } from "@shared/format";
import { formatNim } from "@shared/units";
import type { ShowState } from "@shared/showstate";
import type { ShowCard } from "@/lib/queries";
import { useShowState } from "@/lib/use-now";

export function StateSticker({ state }: { state: ShowState }) {
  if (state === "live") return <LiveSticker />;
  return <span className={`sticker ${state === "ended" ? "sticker-cream" : "sticker-blue"}`}>{state === "ended" ? "Replay" : "Soon"}</span>;
}

/** Home hero: headline and actions on one side, a floating 3D record on the other. Stacks on phones. */
export function ShowHero({ show }: { show: ShowCard }) {
  const state = useShowState(show);
  const live = state === "live";
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-[28px] border border-line bg-surface/60">
      {/* the artist's own cover, faded into the card; text keeps its contrast because the cover is dimmed */}
      {show.coverKey && (
        <>
          <Cover seed={show.id} image={show.coverKey} className="pointer-events-none absolute inset-0 h-full w-full opacity-35" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/75 to-surface/30" />
        </>
      )}
      {/* ambient glow tinted by the show's own colours: a plain gradient, no blur filter */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-[460px] w-[460px] rounded-full" style={{ background: `radial-gradient(closest-side, ${coverColors(show.id)[0]}55, transparent)` }} />
      <div className="relative grid items-center gap-2 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8 lg:p-12">
        <div className="order-2 lg:order-1">
          <p className="enter" style={{ ["--d" as string]: 0 }}>
            <StateSticker state={state} />
          </p>
          <p className="enter label mt-4" style={{ ["--d" as string]: 1 }}>
            {show.artist.name} · {live ? "Streaming now" : fmtWhen(show.startsAt)}
          </p>
          <h1 id="hero-title" className="enter display display-xl mt-2 break-words" style={{ ["--d" as string]: 2 }}>
            {show.title}
          </h1>
          {show.description && (
            <p className="enter mt-4 line-clamp-2 max-w-[48ch] text-lg text-muted" style={{ ["--d" as string]: 3 }}>
              {show.description}
            </p>
          )}
          <div className="enter mt-6 flex flex-wrap items-center gap-3" style={{ ["--d" as string]: 4 }}>
            <Link href={`/show/${show.id}`} className="btn btn-primary">
              {live ? "Tune in" : "Get tickets"}
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
            <Link href={`/artist/${show.artist.handle}`} className="btn btn-ghost">
              {show.artist.name}
            </Link>
            <p className="flex items-center gap-2 font-mono text-sm text-muted">
              <Ticket aria-hidden="true" size={16} />
              {state === "upcoming" ? (
                <>
                  <Countdown to={show.startsAt} /> · {formatNim(show.priceLuna)}
                </>
              ) : (
                formatNim(show.priceLuna)
              )}
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <HeroDisc seed={show.id} image={show.coverKey} fallback={<Vinyl seed={show.id} />} />
        </div>
      </div>
    </section>
  );
}

export function ShowPoster({ show }: { show: ShowCard }) {
  const state = useShowState(show);
  return (
    <Link href={`/show/${show.id}`} className="lift card block w-[260px] overflow-hidden md:w-auto">
      <div className="relative">
        <Cover seed={show.id} image={show.coverKey} className="aspect-[4/3] w-full" />
        <div className="absolute left-3 top-3 z-10">
          <StateSticker state={state} />
        </div>
      </div>
      <div className="p-4">
        <p className="display display-sm line-clamp-2 min-h-[46px]">{show.title}</p>
        <p className="mt-2 truncate text-sm text-muted">{show.artist.name}</p>
        <p className="mt-1 font-mono text-xs text-muted">
          {state === "live" ? "Live now" : fmtWhen(show.startsAt)} · {formatNim(show.priceLuna)}
        </p>
      </div>
    </Link>
  );
}
