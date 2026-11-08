import { Link } from "@/components/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { SignInPanel } from "@/components/auth";
import { PassCard } from "@/components/pass-card";
import { Skeleton } from "@/components/skeleton";
import { shortAddress } from "@shared/units";
import { useTitle } from "@/lib/use-now";

function Row({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center justify-between gap-3 border-b border-line py-3">
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
      <ChevronRight aria-hidden="true" size={20} />
    </Link>
  );
}

export default function MePage() {
  useTitle("Me");
  const { me, loading, logout, inNimiqPay } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const user = me?.user;

  if (loading)
    return (
      <div className="wrap max-w-3xl pt-6 md:pt-8">
        <h1 className="display display-lg">Me</h1>
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );

  return (
    <div className="wrap max-w-3xl pt-6 md:pt-8">
      <h1 className="display display-lg">Me</h1>
      {!user ? (
        <div className="mt-4"><SignInPanel /></div>
      ) : (
        <>
          <div className="card-ivory mt-4 p-5">
            <p className="font-mono text-xs uppercase text-cream-muted">{user.role}</p>
            <p className="display display-md break-words">{user.name}</p>
            <p className="mt-1 break-all font-mono text-xs text-cream-muted">{user.address.startsWith("DEMO") ? "Demo account" : shortAddress(user.address)}</p>
          </div>
          <div className="mt-4">
            <PassCard />
          </div>
          <nav aria-label="Account" className="mt-4">
            {me?.artist ? <Row href="/studio" title="Artist studio" body={`Manage @${me.artist.handle}: shows, tracks, earnings`} /> : <Row href="/studio" title="Become an artist" body="Sell tickets and memberships for your music" />}
            {user.role === "admin" && <Row href="/admin" title="Admin" body="Review reports and verify artists" />}
            <Row href="/library" title="Library" body="Tickets, memberships, purchased tracks" />
            <Row href="/receipts" title="Receipts" body="Payments you've made" />
            <Row href="/settings" title="Settings" body="Name, wallet, your data, delete account" />
            <Row href="/help" title="Help" body="How signing in and paying work" />
            <Row href="/policy" title="Content & rights policy" body="What's allowed, and how takedowns work" />
          </nav>
          <button
            type="button"
            className="btn btn-ghost mt-6 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await logout();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
        </>
      )}
      <p className="mt-8 text-sm text-muted">{inNimiqPay ? "Running inside Nimiq Pay." : "Open NimStage from Nimiq Pay's Mini Apps to pay with NIM."}</p>
    </div>
  );
}
