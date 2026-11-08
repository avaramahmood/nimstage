import { useQuery } from "@tanstack/react-query";
import { SignInPanel } from "@/components/auth";
import { EmptyState } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useTitle } from "@/lib/use-now";
import { formatNim } from "@shared/units";

type Receipt = { id: string; kind: string; status: "confirmed" | "pending"; item: string; artist: string; amountLuna: number; txHash: string | null; at: string };

const KIND: Record<string, string> = { ticket: "Ticket", track: "Track", membership: "Membership", tip: "Tip" };
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Row({ r }: { r: Receipt }) {
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">{KIND[r.kind] ?? r.kind}{r.status === "pending" ? " · pending" : ""}</p>
          <p className="truncate font-medium">{r.item}</p>
          <p className="truncate text-sm text-muted">{r.artist}</p>
        </div>
        <p className="shrink-0 font-mono">{formatNim(r.amountLuna)}</p>
      </div>
      <p className="mt-2 text-sm text-muted">{fmt(r.at)}</p>
      {r.txHash && <p className="mt-1 break-all font-mono text-xs text-muted">Tx {r.txHash.startsWith("demo-") ? `${r.txHash} (demo)` : r.txHash}</p>}
    </li>
  );
}

export default function ReceiptsPage() {
  useTitle("Receipts");
  const { me, loading } = useWallet();
  const signedIn = !!me?.user;
  const q = useQuery({ queryKey: ["receipts", me?.user?.id], queryFn: () => api<{ receipts: Receipt[] }>("/api/me/receipts"), enabled: signedIn });

  const all = q.data?.receipts ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const done = all.filter((r) => r.status === "confirmed");

  return (
    <div className="wrap pt-6">
      <h1 className="display display-lg">Receipts</h1>
      <p className="mt-2 text-muted">Your payments, newest first.</p>

      {loading || (signedIn && q.isLoading) ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : !signedIn ? (
        <div className="mt-4"><SignInPanel /></div>
      ) : q.isError ? (
        <p role="alert" className="mt-4 text-danger">Couldn&apos;t load your receipts. Try again in a moment.</p>
      ) : q.data!.receipts.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No payments yet" body="When you buy a ticket, track or membership, or send a tip, it shows up here." />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section aria-labelledby="pending-h" className="mt-4">
              <h2 id="pending-h" className="label">Still being checked</h2>
              <p className="mt-1 text-sm text-muted">If you've paid, there's nothing to do: we check the network automatically and this updates by itself. It can take a few minutes.</p>
              <ul className="mt-3 grid gap-3">{pending.map((r) => <Row key={r.id} r={r} />)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="done-h" className="mt-6">
              {pending.length > 0 && <h2 id="done-h" className="label">Confirmed</h2>}
              <ul className="mt-3 grid gap-3">{done.map((r) => <Row key={r.id} r={r} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
