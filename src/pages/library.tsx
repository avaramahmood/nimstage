import { Link } from "@/components/link";
import { EmptyState, SectionTitle } from "@/components/ui";
import { TicketStub } from "@/components/pay";
import { PlayToggle } from "@/components/player-ui";
import { PassCard } from "@/components/pass-card";
import { stateOf } from "@/components/page-state";
import { useLibrary } from "@/lib/queries";
import { useTitle } from "@/lib/use-now";
import { fmtWhen } from "@shared/format";
import { formatNim } from "@shared/units";

export default function LibraryPage() {
  useTitle("Library");
  const q = useLibrary();
  const state = stateOf(q, { title: "Library", body: "Your tickets, supporter memberships and purchased tracks live here, tied to your wallet." });
  if (state) return state;
  const lib = q.data!;
  const empty = !lib.shows.length && !lib.tracks.length && !lib.supporting.length && !lib.following.length;

  return (
    <div className="wrap grid max-w-5xl gap-10 pt-6 md:pt-8">
      <h1 className="display display-lg">Library</h1>
      <PassCard />
      {empty && <EmptyState title="Nothing here yet" body="Buy a ticket, back an artist or follow someone you like. It all shows up here." action={<Link href="/discover" className="btn btn-primary btn-sm">Find music</Link>} />}

      {lib.shows.length > 0 && (
        <section>
          <SectionTitle>Tickets</SectionTitle>
          <ul className="grid gap-4 sm:grid-cols-2">
            {lib.shows.map((s) => (
              <li key={s.id}>
                <Link href={`/show/${s.id}`} className="block">
                  <TicketStub title={s.title} meta={`${s.artist.name} · ${fmtWhen(s.startsAt)}`} price={formatNim(s.priceLuna)} serial={s.id.slice(0, 6).toUpperCase()} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lib.supporting.length > 0 && (
        <section>
          <SectionTitle>Supporting</SectionTitle>
          <ul>
            {lib.supporting.map(({ ent, tier, artist }) => (
              <li key={ent.id} className="border-b border-line py-3">
                <Link href={`/artist/${artist!.handle}`} className="display display-sm block">{artist!.name}</Link>
                <p className="font-mono text-xs uppercase text-muted">
                  {tier!.name} · renews by {ent.expiresAt ? fmtWhen(ent.expiresAt) : "never"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lib.tracks.length > 0 && (
        <section>
          <SectionTitle>Purchased tracks</SectionTitle>
          <ul>
            {lib.tracks.map(({ track, artist }) => (
              <li key={track.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="min-w-0">
                  <Link href={`/track/${track.id}`} className="block truncate font-medium">{track.title}</Link>
                  <span className="block truncate text-sm text-muted">{artist.name}</span>
                </span>
                <PlayToggle track={{ id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, cover: track.coverKey, durationSec: track.durationSec, previewSec: track.previewSec }} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {lib.following.length > 0 && (
        <section>
          <SectionTitle>Following</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {lib.following.map((a) => (
              <li key={a.id}>
                <Link href={`/artist/${a.handle}`} className="inline-flex min-h-10 items-center rounded-full border border-line bg-white/[0.04] px-4">{a.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
