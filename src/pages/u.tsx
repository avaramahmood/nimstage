import { Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/components/link";
import { Cover, EmptyState } from "@/components/ui";
import { ProfileHeader } from "@/components/profile-header";
import { stateOf } from "@/components/page-state";
import { api, ApiError } from "@/lib/api";
import { useTitle } from "@/lib/use-now";
import type { ArtistLink } from "@shared/artist";

type PublicProfile =
  | { artistHandle: string }
  | {
      artistHandle?: undefined;
      user: { username: string; name: string; bio: string; avatarKey: string | null; bannerKey: string | null; accent: string; links: ArtistLink[]; joinedAt: string };
      pass: { levelName: string; level: number; badges: { id: string; name: string }[] } | null;
      following: { id: string; handle: string; name: string; genre: string; avatarKey: string | null }[];
      isMe: boolean;
    };

/** A person's public page: what they chose to show. Artists redirect to their artist page. */
export default function PublicProfilePage() {
  const { username = "" } = useParams();
  const q = useQuery({
    queryKey: ["user", username.toLowerCase()],
    queryFn: () => api<PublicProfile>(`/api/users/${encodeURIComponent(username)}`),
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
  useTitle(q.data && "user" in q.data ? `${q.data.user.name} (@${q.data.user.username})` : "Profile");

  const state = stateOf(q, { title: "No one here", body: "There's no one with that username." });
  if (state) return state;
  const d = q.data!;
  if (!("user" in d)) return <Navigate to={`/artist/${d.artistHandle}`} replace />;
  const { user, pass, following, isMe } = d;

  return (
    <div className="wrap grid gap-6 pt-6">
      <ProfileHeader as="h1" p={{ name: user.name, username: user.username, bio: user.bio, avatarKey: user.avatarKey, bannerKey: user.bannerKey, accent: user.accent, links: user.links, joinedAt: user.joinedAt }}>
        {isMe && (
          <Link href="/me/edit" className="btn btn-ghost btn-sm">
            Edit profile
          </Link>
        )}
      </ProfileHeader>

      {pass && (
        <section aria-labelledby="pass-h" className="card p-5">
          <h2 id="pass-h" className="label">Fan Pass</h2>
          <p className="display display-md">{pass.levelName}</p>
          {pass.badges.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {pass.badges.map((b) => (
                <li key={b.id} className="rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-sm">
                  {b.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No badges yet.</p>
          )}
        </section>
      )}

      <section aria-labelledby="following-h">
        <h2 id="following-h" className="display display-md mb-3">Following</h2>
        {following.length === 0 ? (
          <EmptyState title="Not following anyone yet" body={isMe ? "Follow artists and they'll show up here." : `${user.name} isn't following any artists yet.`} />
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {following.map((a) => (
              <li key={a.id}>
                <Link href={`/artist/${a.handle}`} className="lift card flex flex-col items-center gap-2 p-4 text-center">
                  <Cover seed={`${a.id}-avatar`} image={a.avatarKey} className="h-16 w-16 rounded-full" />
                  <span className="w-full min-w-0">
                    <span className="display display-sm block truncate">{a.name}</span>
                    <span className="block truncate text-sm text-muted">{a.genre}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
