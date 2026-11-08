import { useParams } from "react-router";
import { Check, Pause, Play } from "lucide-react";
import { Link } from "@/components/link";
import { Cover } from "@/components/ui";
import { BuyButton, TipButton } from "@/components/pay";
import { ShareButton } from "@/components/share-actions";
import { stateOf } from "@/components/page-state";
import { useTrack } from "@/lib/queries";
import { usePlayer, type PlayerTrack } from "@/lib/player";
import { useTitle } from "@/lib/use-now";
import { fmtDuration } from "@shared/format";
import { formatNim } from "@shared/units";

/** One track: hear the preview, and buy it, as two separate things. */
export default function TrackPage() {
  const { id = "" } = useParams();
  const q = useTrack(id);
  const p = usePlayer();
  useTitle(q.data?.track.title ?? "Track");

  const state = stateOf(q);
  if (state) return state;
  const { track, artist, access, own, exclusiveShow } = q.data!;
  const free = track.priceLuna <= 0;
  const pt: PlayerTrack = { id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, cover: track.coverKey, durationSec: track.durationSec, previewSec: track.previewSec };
  const active = p.track?.id === track.id && !p.track?.showId;
  const playing = active && p.playing;

  return (
    <article className="wrap pt-6">
      <Cover seed={track.id} image={track.coverKey} className="aspect-square w-full rounded-[28px] border border-line" />

      <h1 className="display display-lg mt-5 break-words">{track.title}</h1>
      <Link href={`/artist/${artist.handle}`} className="mt-1 inline-flex min-h-11 items-center gap-3 text-lg underline decoration-2 underline-offset-4">
        <Cover seed={`${artist.id}-avatar`} image={artist.avatarKey} className="h-8 w-8 rounded-full" />
        {artist.name}
      </Link>
      <p className="mt-2 font-mono text-sm text-muted">
        {fmtDuration(track.durationSec)} · {free && !exclusiveShow ? "Free" : formatNim(track.priceLuna, "Show audio")}
      </p>

      <div className="mt-6 grid gap-3">
        <button type="button" className="btn btn-ghost w-full" onClick={() => (active ? p.toggle() : p.play(pt, [pt]))}>
          {playing ? <Pause aria-hidden="true" size={18} fill="currentColor" /> : <Play aria-hidden="true" size={18} fill="currentColor" />}
          {playing ? "Pause" : access ? "Play the full track" : `Play a ${track.previewSec}-second preview`}
        </button>

        {access ? (
          <p className="flex items-center gap-2 rounded-2xl border border-ok/40 bg-ok/10 p-4 text-ok">
            <Check aria-hidden="true" size={20} />
            {own ? "Your track. You always have full access." : free && !exclusiveShow ? "Free to play in full." : "You own this track. It's in your Library."}
          </p>
        ) : (
          <>
            {!free && (
              <BuyButton
                className="btn btn-primary w-full"
                request={{ kind: "track", refId: track.id }}
                title={track.title}
                meta={artist.name}
                priceLuna={track.priceLuna}
                label="Track"
                cta={`Buy the full track · ${formatNim(track.priceLuna)}`}
                doneText="Track added to your library."
              />
            )}
            {exclusiveShow && (
              <p className="rounded-2xl border border-line bg-white/[0.04] p-4 text-muted">
                {free ? "This track is the audio for " : "A ticket to "}
                <Link href={`/show/${exclusiveShow.id}`} className="text-ink underline underline-offset-4">
                  {exclusiveShow.title}
                </Link>
                {free ? ". A ticket to that show unlocks it." : " also unlocks it."}
              </p>
            )}
            <p className="text-sm text-muted">
              {free ? "" : "Buy once, keep it: the full track plays any time from your Library. "}The payment goes straight to {artist.name}&apos;s wallet, with no platform fee.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <TipButton target={artist.id} artistName={artist.name} className="btn btn-blue btn-sm" />
        <ShareButton title={track.title} text={`${track.title} by ${artist.name} on NimStage`} path={`/track/${track.id}`} />
      </div>
    </article>
  );
}
