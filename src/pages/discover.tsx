import { useState } from "react";
import { useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { Link } from "@/components/link";
import { Cover, EmptyState, SectionTitle } from "@/components/ui";
import { PlayToggle } from "@/components/player-ui";
import { ShowPoster } from "@/components/show-card";
import { SurpriseButton } from "@/components/surprise";
import { stateOf } from "@/components/page-state";
import { useDiscover } from "@/lib/queries";
import { useTitle } from "@/lib/use-now";
import { formatNim } from "@shared/units";

const GENRES = ["Dream pop", "Afro-indie", "Electronic", "Folk", "Lo-fi"];

export default function DiscoverPage() {
  useTitle("Discover");
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  const [draft, setDraft] = useState(q);
  const res = useDiscover(q);

  const state = stateOf(res);
  const body = (() => {
    if (state) return state;
    const { artists, tracks, shows } = res.data!;
    if (!artists.length && !tracks.length && !shows.length) {
      return <div className="mt-10"><EmptyState title="Nothing found" body={`No artists, shows or tracks match “${q}”. Try a genre or a name.`} /></div>;
    }
    return (
      <div className={`mt-10 grid gap-12 transition-opacity ${res.isPlaceholderData ? "opacity-60" : ""}`}>
        {shows.length > 0 && (
          <section>
            <SectionTitle>Shows</SectionTitle>
            <div className="rail">{shows.map((s) => <ShowPoster key={s.id} show={s} />)}</div>
          </section>
        )}
        {artists.length > 0 && (
          <section>
            <SectionTitle>Artists</SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {artists.map((a) => (
                <li key={a.id}>
                  <Link href={`/artist/${a.handle}`} className="lift card grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 p-4">
                    <Cover seed={a.id} image={a.avatarKey} className="h-16 w-16 rounded-full" />
                    <span className="min-w-0">
                      <span className="display display-sm block truncate">{a.name}</span>
                      <span className="text-sm text-muted">{a.genre}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tracks.length > 0 && (
          <section>
            <SectionTitle>Tracks</SectionTitle>
            <ul className="grid gap-2 md:grid-cols-2">
              {tracks.map(({ track, artist }) => (
                <li key={track.id} className="card grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 p-3">
                  <Cover seed={track.id} image={track.coverKey} className="h-14 w-14 rounded-xl" />
                  <span className="min-w-0">
                    <Link href={`/track/${track.id}`} className="block truncate font-medium">{track.title}</Link>
                    <span className="block truncate text-sm text-muted">{artist.name} · {formatNim(track.priceLuna)}</span>
                  </span>
                  <PlayToggle track={{ id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, cover: track.coverKey, durationSec: track.durationSec, previewSec: track.previewSec }} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  })();

  return (
    <div className="wrap pt-6 md:pt-8">
      <h1 className="display display-lg">Discover</h1>

      <form
        role="search"
        className="mt-5 flex max-w-2xl items-center gap-2 lg:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(draft.trim() ? { q: draft.trim() } : {});
        }}
      >
        <label htmlFor="q" className="sr-only">Search artists, shows and tracks</label>
        <input id="q" name="q" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search artists, shows, tracks" className="field min-w-0 flex-1 rounded-full" />
        <button type="submit" aria-label="Search" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
          <Search aria-hidden="true" size={20} />
        </button>
      </form>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres">
        <li><SurpriseButton /></li>
        {GENRES.map((g) => (
          <li key={g}>
            <Link href={`/discover?q=${encodeURIComponent(g.split(" ")[0])}`} onClick={() => setDraft(g.split(" ")[0])} className="inline-flex min-h-10 items-center rounded-full border border-line bg-white/[0.04] px-4 text-sm transition-colors hover:bg-white/[0.1]">
              {g}
            </Link>
          </li>
        ))}
      </ul>

      {body}
    </div>
  );
}
