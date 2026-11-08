import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Cover } from "@/components/ui";
import { accentColor, type ArtistLink } from "@shared/artist";

export type ProfileLook = {
  name: string;
  username: string | null;
  bio?: string;
  avatarKey?: string | null;
  bannerKey?: string | null;
  accent?: string;
  links?: ArtistLink[];
  joinedAt?: string | Date | null;
};

/**
 * The top of a profile: banner, picture, name, @username, bio, links and a glow in the person's accent
 * colour. Used for the public profile, your own Me page, and the live preview while you edit.
 */
export function ProfileHeader({ p, as: Heading = "h2", children }: { p: ProfileLook; as?: "h1" | "h2"; children?: ReactNode }) {
  const accent = accentColor(p.accent);
  const seed = p.username ?? "new";
  const joined = p.joinedAt ? new Date(p.joinedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null;
  return (
    <header className="card overflow-hidden" style={accent ? { borderColor: `${accent}66`, boxShadow: `0 28px 80px -44px ${accent}` } : undefined}>
      <Cover seed={`${seed}-banner`} image={p.bannerKey} className="h-32 w-full" />
      <div className="px-5 pb-5">
        <Cover seed={`${seed}-avatar`} image={p.avatarKey} className="relative z-10 -mt-12 h-24 w-24 rounded-full ring-4 ring-surface" />
        <Heading className="display display-md mt-3 break-words">{p.name || "Your name"}</Heading>
        <p className="font-mono text-sm text-muted">
          @{p.username || "username"}
          {joined && <> · Joined {joined}</>}
        </p>
        {p.bio && <p className="mt-3 max-w-[60ch] break-words">{p.bio}</p>}
        {!!p.links?.length && (
          <ul aria-label="Links" className="mt-3 flex flex-wrap gap-2">
            {p.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn btn-ghost btn-sm">
                  {l.label}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              </li>
            ))}
          </ul>
        )}
        {children && <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </header>
  );
}
