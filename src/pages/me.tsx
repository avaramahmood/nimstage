import { Link } from "@/components/link";
import { useQuery } from "@tanstack/react-query";
import { ProfileHeader } from "@/components/profile-header";
import { api } from "@/lib/api";
import type { ArtistLink } from "@shared/artist";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { SignInPanel } from "@/components/auth";
import { ApproveDevice } from "@/components/manual";
import { UpdatesCard } from "@/components/foryou";
import { PassCard } from "@/components/pass-card";
import { Skeleton } from "@/components/skeleton";
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
  const { data: prof } = useQuery({ queryKey: ["my-profile", user?.id], queryFn: () => api<{ bio: string; bannerKey: string | null; avatarKey: string | null; links: ArtistLink[]; joinedAt: string }>("/api/me/profile"), enabled: !!user });

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
          <div className="mt-4 grid gap-3">
            <ProfileHeader p={{ name: user.name, username: user.username, bio: prof?.bio, avatarKey: user.avatarKey, bannerKey: prof?.bannerKey, accent: user.accent, links: prof?.links, joinedAt: prof?.joinedAt }}>
              <Link href="/me/edit" className="btn btn-primary btn-sm">Edit profile</Link>
              {user.username && <Link href={`/u/${user.username}`} className="btn btn-ghost btn-sm">View public profile</Link>}
            </ProfileHeader>
            {prof && (!prof.avatarKey || !prof.bio) && (
              <Link href="/me/edit" className="card flex items-center justify-between gap-3 p-4">
                <span>
                  <span className="block font-medium">Make it yours</span>
                  <span className="block text-sm text-muted">Add {!prof.avatarKey ? "a picture" : ""}{!prof.avatarKey && !prof.bio ? " and " : ""}{!prof.bio ? "a bio" : ""}, pick an accent colour, add your links.</span>
                </span>
                <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
              </Link>
            )}
          </div>
          <UpdatesCard />
          <div className="mt-4">
            <PassCard />
          </div>
          <ApproveDevice />
          <nav aria-label="Account" className="mt-4">
            {me?.artist ? <Row href="/studio" title="Artist studio" body={`Manage @${me.artist.handle}: shows, tracks, earnings`} /> : <Row href="/studio" title="Become an artist" body="Sell tickets and memberships for your music" />}
            {user.role === "admin" && <Row href="/admin" title="Admin" body="Review reports and verify artists" />}
            <Row href="/library" title="Library" body="Tickets, memberships, purchased tracks" />
            <Row href="/earn" title="Earn" body="Stake your NIM and earn rewards" />
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
      <p className="mt-8 text-sm text-muted">{inNimiqPay ? "Running inside Nimiq Pay." : "You are in a browser: payments are sent by hand from any Nimiq wallet, and NimStage finds them on the Nimiq network."}</p>
    </div>
  );
}
