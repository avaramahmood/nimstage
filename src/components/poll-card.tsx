import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { celebrate, haptic } from "@/lib/fun";
import { checkNewBadges } from "@/lib/pass";

export type PollData = {
  id: string;
  question: string;
  status: string;
  tierName: string | null;
  options: { id: string; label: string; votes: number }[];
  total: number;
  myVote: string | null;
  canVote: boolean;
  reason: string | null;
};

/** A setlist poll. Results are visible to everyone; voting follows the poll's rules (tier-gated polls need that tier). */
export function PollCard({ poll }: { poll: PollData }) {
  const router = useRouter();
  const toast = useToast();
  const { me } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);

  async function vote(optionId: string) {
    if (!poll.canVote || busy || optionId === poll.myVote) return;
    setBusy(optionId);
    try {
      await api(`/api/polls/${poll.id}/vote`, { optionId });
      haptic(12);
      toast(poll.myVote ? "Vote changed." : "Vote counted. Thanks!", "ok");
      router.refresh();
      if (me?.user) {
        const badges = await checkNewBadges(me.user.id);
        if (badges.length) {
          celebrate();
          toast(`Badge unlocked: ${badges.join(", ")}`, "ok");
        }
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const closed = poll.status !== "open";
  return (
    <article className="card p-5" aria-label={`Poll: ${poll.question}`}>
      <p className="label">
        {closed ? "Poll closed" : "Setlist poll"}
        {poll.tierName ? ` · ${poll.tierName} supporters` : ""}
      </p>
      <h3 className="display display-sm mt-1">{poll.question}</h3>
      <ul className="mt-4 grid gap-2">
        {poll.options.map((o) => {
          const pct = poll.total ? o.votes / poll.total : 0;
          const mine = o.id === poll.myVote;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => vote(o.id)}
                disabled={!poll.canVote || !!busy}
                aria-pressed={mine}
                className={`relative min-h-12 w-full overflow-hidden rounded-2xl border px-4 text-left transition-colors ${mine ? "border-accent" : "border-line"} ${poll.canVote ? "hover:bg-white/[0.06]" : "cursor-default"}`}
              >
                {/* result bar: scaleX on the compositor, not width */}
                <span aria-hidden="true" className="absolute inset-0 origin-left bg-accent/20 transition-transform duration-500" style={{ transform: `scaleX(${pct})` }} />
                <span className="relative flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-2">
                    {mine && <Check aria-hidden="true" size={16} className="text-accent" />}
                    {o.label}
                    {mine && <span className="sr-only"> (your vote)</span>}
                  </span>
                  <span className="font-mono text-sm text-muted">
                    {Math.round(pct * 100)}% · {o.votes}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {poll.total} {poll.total === 1 ? "vote" : "votes"}
        {poll.reason ? ` · ${poll.reason}` : poll.canVote ? (poll.myVote ? " · tap another option to change your vote" : " · tap to vote") : ""}
      </p>
    </article>
  );
}
