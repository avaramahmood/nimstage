import { Plus } from "lucide-react";
import { Link } from "@/components/link";
import { EmptyState, SectionTitle } from "@/components/ui";
import { ClosePollButton, ProfileForm, RemoveButton } from "@/components/studio-forms";
import { ArtworkEditor } from "@/components/artwork-editor";
import { stateOf } from "@/components/page-state";
import { useStudio } from "@/lib/queries";
import { useWallet } from "@/lib/wallet";
import { useNow, useTitle } from "@/lib/use-now";
import { fmtWhen } from "@shared/format";
import { formatNim } from "@shared/units";
import { showState } from "@shared/showstate";

function Stat({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`rounded-[20px] p-4 ${hot ? "bg-accent text-accent-ink" : "card"}`}>
      <p className={`font-mono text-xs uppercase ${hot ? "" : "text-muted"}`}>{label}</p>
      <p className="display display-sm mt-1 break-words">{value}</p>
    </div>
  );
}

export default function StudioPage() {
  useTitle("Studio");
  const q = useStudio();
  const { me } = useWallet();
  const now = useNow();
  const state = stateOf(q, { title: "Studio", body: "Sign in to sell tickets, premieres and memberships for your music." });
  if (state) return state;
  const { artist, studio: s } = q.data!;

  if (!artist || !s) {
    return (
      <div className="wrap max-w-3xl pt-6 md:pt-8">
        <h1 className="display display-lg">Become an artist</h1>
        <p className="mb-5 mt-2 text-muted">Create your profile and start earning NIM. Fans pay your wallet directly, and there are no platform fees.</p>
        <ProfileForm username={me?.user?.username} />
      </div>
    );
  }

  return (
    <div className="wrap grid max-w-5xl gap-10 pt-6 md:pt-8">
      <header>
        <p className="label">Studio</p>
        <h1 className="display display-lg break-words">{artist.name}</h1>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
          <Link href={`/artist/${artist.handle}`} className="underline underline-offset-4">View public page</Link>
          <Link href="/studio/profile" className="underline underline-offset-4">Edit profile</Link>
        </p>
      </header>

      <section aria-label="Earnings" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat hot label="Earned" value={formatNim(s.earnings.total, "0 NIM")} />
        <Stat label="Tickets & tracks" value={formatNim(s.earnings.tickets, "0 NIM")} />
        <Stat label="Memberships" value={formatNim(s.earnings.memberships, "0 NIM")} />
        <Stat label="Tips" value={formatNim(s.earnings.tips, "0 NIM")} />
        <Stat label="Supporters" value={String(s.supporters)} />
        <Stat label="Followers" value={String(s.followers)} />
      </section>
      <p className="-mt-6 text-sm text-muted">Earnings are payments verified on-chain. They go straight to your payout wallet: {artist.payoutAddress.startsWith("NQ07 0000") ? "(demo address)" : artist.payoutAddress}</p>

      <nav aria-label="Create" className="flex flex-wrap gap-3">
        <Link href="/studio/track/new" className="btn btn-primary"><Plus aria-hidden="true" size={18} /> Track</Link>
        <Link href="/studio/show/new" className="btn btn-primary"><Plus aria-hidden="true" size={18} /> Show</Link>
        <Link href="/studio/post/new" className="btn btn-ghost"><Plus aria-hidden="true" size={18} /> Post</Link>
        <Link href="/studio/poll/new" className="btn btn-ghost"><Plus aria-hidden="true" size={18} /> Poll</Link>
        <Link href="/studio/tiers" className="btn btn-ghost">Tiers</Link>
      </nav>

      <section>
        <SectionTitle>Shows</SectionTitle>
        {s.shows.length === 0 ? <EmptyState title="No shows yet" body="Upload a track, then schedule your first premiere." /> : (
          <ul>
            {s.shows.map((sh) => (
              <li key={sh.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <Link href={`/show/${sh.id}`} className="min-w-0">
                  <span className="block truncate font-medium">{sh.title}</span>
                  <span className="block font-mono text-xs uppercase text-muted">{showState(sh, now)} · {fmtWhen(sh.startsAt)} · {formatNim(sh.priceLuna)}</span>
                </Link>
                <span className="flex items-center gap-1">
                  <ArtworkEditor compact kind="show" id={sh.id} seed={sh.id} current={sh.coverKey} label={sh.title} />
                  <RemoveButton kind="show" id={sh.id} label={sh.title} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Tracks</SectionTitle>
        {s.tracks.length === 0 ? <EmptyState title="No tracks yet" body="Upload your first song." /> : (
          <ul>
            {s.tracks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.title}{t.status === "removed" ? " (removed)" : ""}</span>
                  <span className="block font-mono text-xs uppercase text-muted">{formatNim(t.priceLuna)} · {t.plays} plays</span>
                </span>
                {t.status === "published" && (
                  <span className="flex items-center gap-1">
                    <ArtworkEditor compact kind="track" id={t.id} seed={t.id} current={t.coverKey} label={t.title} />
                    <RemoveButton kind="track" id={t.id} label={t.title} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Polls</SectionTitle>
        {s.polls.length === 0 ? (
          <EmptyState title="No polls yet" body="Let fans vote on the next setlist. It's a great reason for them to become supporters." action={<Link href="/studio/poll/new" className="btn btn-primary btn-sm">Start a poll</Link>} />
        ) : (
          <ul>
            {s.polls.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.question}</span>
                  <span className="block font-mono text-xs uppercase text-muted">{p.status} · {p.votes} {p.votes === 1 ? "vote" : "votes"}</span>
                </span>
                <span className="flex shrink-0 items-center">
                  {p.status === "open" && <ClosePollButton id={p.id} label={p.question} />}
                  <RemoveButton kind="poll" id={p.id} label={p.question} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Tiers</SectionTitle>
        <ul>
          {s.tiers.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
              <span><span className="block font-medium">{t.name}</span><span className="block font-mono text-xs uppercase text-muted">{formatNim(t.priceLuna)} / 30 days</span></span>
              <RemoveButton kind="tier" id={t.id} label={t.name} />
            </li>
          ))}
          {s.tiers.length === 0 && <li className="text-muted">No tiers yet. Add one so fans can support you monthly.</li>}
        </ul>
      </section>

      <section>
        <SectionTitle>Recent payments</SectionTitle>
        {s.recent.length === 0 ? <p className="text-muted">Nothing yet. Share your artist page to get your first supporter.</p> : (
          <ul>
            {s.recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
                <span className="capitalize">{p.kind}</span>
                <span className="font-mono text-sm">{formatNim(p.amountLuna)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
