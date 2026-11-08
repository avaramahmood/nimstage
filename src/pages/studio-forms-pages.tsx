// Shared plumbing for the small Studio pages (each is a heading plus one form).
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { stateOf } from "@/components/page-state";
import { useStudio, type StudioView } from "@/lib/queries";
import { useTitle } from "@/lib/use-now";

type ArtistStudio = StudioView & { artist: NonNullable<StudioView["artist"]> };

/** Loads the studio context and renders the page body only for signed-in artists (others are sent to /studio). */
export function StudioPage({ title, intro, children }: { title: string; intro?: string; children: (ctx: ArtistStudio) => ReactNode }) {
  useTitle(title);
  const q = useStudio();
  const state = stateOf(q, { title, body: "Sign in to manage your music." });
  if (state) return state;
  const data = q.data!;
  if (!data.artist) return <Navigate to="/studio" replace />;
  return (
    <div className="wrap max-w-3xl pt-6 md:pt-8">
      <h1 className="display display-lg mb-2">{title}</h1>
      {intro && <p className="mb-5 text-muted">{intro}</p>}
      {children(data as ArtistStudio)}
    </div>
  );
}
