import { lazy, Suspense } from "react";
import { useParams } from "react-router";
import { BadgeCheck, Check } from "lucide-react";
import { Link } from "@/components/link";
import { Cover } from "@/components/ui";
import { StateSticker } from "@/components/show-card";
import { Countdown } from "@/components/countdown";
import { BuyButton, TipButton } from "@/components/pay";
import { Ticket3D as FlatTicket } from "@/components/depth";
import { Ticket3D } from "@/stage/stage";
import { TrackRow } from "@/components/player-ui";
import { ReportButton } from "@/components/social";
import { LiveRoom, useLiveRoom } from "@/components/live-room";
import { CalendarButtons, ShareButton } from "@/components/share-actions";
import { stateOf } from "@/components/page-state";
import { useShow } from "@/lib/queries";
import { useNow, useTitle } from "@/lib/use-now";
import { fmtWhen } from "@shared/format";
import { formatNim } from "@shared/units";
import { showState } from "@shared/showstate";
import { joinWindow } from "@shared/live";

const LiveVideo = lazy(() => import("@/components/live-video"));

export default function ShowPage() {
  const { id = "" } = useParams();
  const q = useShow(id);
  const now = useNow();
  useTitle(q.data?.show.title ?? "Show");

  // The room's chat and reactions run from here so the page card and the full-screen view share one poll.
  const room = useLiveRoom(id, q.data?.canChat ?? false, q.data ? showState(q.data.show, now) === "live" : false);

  const state = stateOf(q);
  if (state) return state;
  const { show, track, access, own } = q.data!;
  const st = showState(show, now);
  const free = show.priceLuna <= 0;
  const price = formatNim(show.priceLuna);
  const meta = `${show.artist.name} · ${fmtWhen(show.startsAt)}`;
  const serial = show.id.slice(0, 6).toUpperCase();
  const video = show.kind === "live";

  return (
    <article className="wrap pt-6 md:pt-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div className="grid content-start gap-6">
          {/* Header card */}
          <header className="relative overflow-hidden rounded-[28px] border border-line">
            <Cover seed={show.id} image={show.coverKey} className="absolute inset-0 h-full w-full" />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-bg via-bg/65 to-transparent" />
            <div className="relative flex min-h-[260px] flex-col justify-end gap-3 p-6 sm:min-h-[320px] sm:p-8">
              <div className="flex items-center gap-3">
                <StateSticker state={st} />
                <span className="label text-ink/80">
                  {fmtWhen(show.startsAt)} · {show.durationMin >= 1440 ? "Open all week" : `${show.durationMin} min`}
                  {video && " · Live video"}
                </span>
              </div>
              <h1 className="display display-xl break-words">{show.title}</h1>
              <Link href={`/artist/${show.artist.handle}`} className="inline-flex w-fit items-center gap-1.5 text-lg underline decoration-2 underline-offset-4">
                {show.artist.name}
                {show.artist.verified && <BadgeCheck aria-label="Verified artist" size={18} className="text-blue" />}
              </Link>
            </div>
          </header>

          {show.description && <p className="max-w-[64ch] text-lg text-muted">{show.description}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <ShareButton title={show.title} text={`${show.artist.name} on NimStage: ${show.title}`} path={`/show/${show.id}`} />
            {st !== "ended" && <CalendarButtons id={show.id} title={show.title} startsAt={show.startsAt} durationMin={show.durationMin} description={`${show.artist.name} on NimStage`} path={`/show/${show.id}`} />}
          </div>

          {st === "upcoming" && (
            <div className="card flex items-center justify-between gap-4 p-5">
              <p className="label">Doors open in</p>
              <Countdown to={show.startsAt} large />
            </div>
          )}

          {/* Access: a 3D ticket (flat fallback), or confirmation */}
          {access ? (
            <p className="flex items-center gap-2 rounded-2xl border border-ok/40 bg-ok/10 p-4 text-ok">
              <Check aria-hidden="true" size={20} />
              {own ? "Your show. You always have full access." : free ? "Free show. Enjoy." : "You're in. Full access unlocked."}
            </p>
          ) : (
            <section aria-label="Ticket" className="card grid gap-5 p-5 sm:p-6">
              <Ticket3D title={show.title} meta={meta} price={price} serial={serial} fallback={<FlatTicket title={show.title} meta={meta} price={price} serial={serial} />} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                <p className="text-muted">One ticket, this show, forever. Supporters of {show.artist.name} get every show free.</p>
                {/* sticks above the tab bar while you read the page, so the main action is always in reach */}
                <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 -mx-2 rounded-[22px] bg-surface/95 p-2">
                <BuyButton
                  className="btn btn-primary w-full"
                  request={{ kind: "ticket", refId: show.id }}
                  title={show.title}
                  meta={meta}
                  priceLuna={show.priceLuna}
                  label="Ticket"
                  cta={`Get ticket · ${price}`}
                  doneText="Ticket added to your library."
                />
                </div>
              </div>
            </section>
          )}

          {video && (access || own) && joinWindow(show, own ? "host" : "viewer", now) !== "ended" && (
            <section aria-label="Live video">
              <h2 className="label mb-2">{own ? "Your stream" : "Watch"}</h2>
              <Suspense fallback={<div className="aspect-video w-full rounded-[20px] bg-surface" />}>
                <LiveVideo showId={show.id} host={own} open={own || joinWindow(show, "viewer", now) === "ok"} room={room} artist={{ name: show.artist.name, handle: show.artist.handle, avatarKey: show.artist.avatarKey }} title={show.title} />
              </Suspense>
            </section>
          )}

          {track && (
            <section aria-label="Show audio">
              <h2 className="label mb-2">{st === "ended" ? "Replay" : "Listen"}</h2>
              <ul className="card p-2">
                <TrackRow index={0} track={track} artist={show.artist} priceLabel={access ? "Full set" : "Ticket unlocks the full set"} locked={!access} showId={show.id} />
              </ul>
            </section>
          )}
        </div>

        <aside className="mt-6 grid content-start gap-4 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <div className="flex flex-wrap items-center gap-3">
            <TipButton target={show.id} artistName={show.artist.name} className="btn btn-blue btn-sm" />
            <ReportButton targetKind="show" targetId={show.id} />
          </div>
          <LiveRoom room={room} />
        </aside>
      </div>
    </article>
  );
}
