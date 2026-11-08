import { Link } from "@/components/link";
import { usePathname } from "@/lib/nav";
import { Compass, House, Library, Mic, Search, User } from "lucide-react";
import type { ReactNode } from "react";
import { useWallet } from "@/lib/wallet";
import { MiniPlayer, PlayerSheet } from "@/components/player-ui";

const TABS = [
  { href: "/", label: "Home", Icon: House },
  { href: "/discover", label: "Discover", Icon: Compass },
  { href: "/library", label: "Library", Icon: Library },
  { href: "/studio", label: "Studio", Icon: Mic },
  { href: "/me", label: "Me", Icon: User },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-[family-name:var(--font-display)] text-lg font-bold" aria-label="NimStage home">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-ink">
        <span className="block h-3 w-3 rounded-full border-[3px] border-current" />
      </span>
      NimStage
    </Link>
  );
}

/** Signed in: an initial in a circle. Signed out: a clear Sign in button. Both go to a 44px+ target. */
function Account() {
  const { me } = useWallet();
  const user = me?.user;
  if (!user) {
    return (
      <Link href="/signin" className="btn btn-primary btn-sm">
        Sign in
      </Link>
    );
  }
  const initial = (user.name.match(/[A-Za-z0-9]/)?.[0] ?? "N").toUpperCase();
  return (
    <Link href="/me" aria-label={`Your account, ${user.name}`} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-2 font-[family-name:var(--font-display)] font-bold">
      {initial}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>

      {/* One phone-width column, centred on a wide screen, with hairline edges so it reads as an app. */}
      <div className="app-col min-h-dvh border-x border-line bg-bg">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Brand />
            <div className="flex items-center gap-2">
              <Link href="/discover" aria-label="Search" className="grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-ink">
                <Search aria-hidden="true" size={20} />
              </Link>
              <Account />
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 pb-[calc(168px+env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>

      <MiniPlayer />
      <PlayerSheet />

      <nav aria-label="Main" className="fixed bottom-0 left-1/2 z-40 w-full max-w-[520px] -translate-x-1/2 border-x border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {TABS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${isActive(href) ? "text-accent" : "text-muted"}`}
            >
              <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${isActive(href) ? "bg-accent/15" : ""}`}>
                <Icon aria-hidden="true" size={22} />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
