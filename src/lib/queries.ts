// Typed data hooks for every page. Query keys are stable so navigating back is instant, and
// `prefetchRoute` lets links warm the cache before the click.
import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import type { Serialized } from "@shared/types";
import type { adminView, artistView, discoverView, homeView, libraryView, showView, studioView, trackView } from "@srv/views";
import { api, ApiError } from "./api";

type View<F extends (...args: never[]) => unknown> = Serialized<NonNullable<Awaited<ReturnType<F>>>>;
export type HomeView = View<typeof homeView>;
export type DiscoverView = View<typeof discoverView>;
export type ArtistView = View<typeof artistView>;
export type ShowView = View<typeof showView>;
export type TrackView = View<typeof trackView>;
export type LibraryView = View<typeof libraryView>;
export type StudioView = View<typeof studioView>;
export type AdminView = View<typeof adminView>;

export type ShowCard = HomeView["live"][number];

const notFoundNoRetry = (count: number, e: unknown) => !(e instanceof ApiError && e.status < 500) && count < 2;

export const keys = {
  home: ["home"] as const,
  discover: (q: string) => ["discover", q] as const,
  artist: (handle: string) => ["artist", handle] as const,
  show: (id: string) => ["show", id] as const,
  track: (id: string) => ["track", id] as const,
  library: ["library"] as const,
  studio: ["studio"] as const,
  admin: ["admin"] as const,
};

const fetchers = {
  home: () => api<HomeView>("/api/home"),
  discover: (q: string) => api<DiscoverView>(`/api/discover?q=${encodeURIComponent(q)}`),
  artist: (handle: string) => api<ArtistView>(`/api/artists/${encodeURIComponent(handle)}`),
  show: (id: string) => api<ShowView>(`/api/shows/${encodeURIComponent(id)}`),
  track: (id: string) => api<TrackView>(`/api/tracks/${encodeURIComponent(id)}`),
  library: () => api<LibraryView>("/api/library"),
  studio: () => api<StudioView>("/api/studio"),
  admin: () => api<AdminView>("/api/admin"),
};

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: fetchers.home, staleTime: 15_000 });
export const useDiscover = (q: string) => useQuery({ queryKey: keys.discover(q), queryFn: () => fetchers.discover(q), placeholderData: keepPreviousData, staleTime: 15_000 });
export const useArtist = (handle: string) => useQuery({ queryKey: keys.artist(handle), queryFn: () => fetchers.artist(handle), retry: notFoundNoRetry });
export const useShow = (id: string) => useQuery({ queryKey: keys.show(id), queryFn: () => fetchers.show(id), retry: notFoundNoRetry });
export const useTrack = (id: string) => useQuery({ queryKey: keys.track(id), queryFn: () => fetchers.track(id), retry: notFoundNoRetry });
export const useLibrary = () => useQuery({ queryKey: keys.library, queryFn: fetchers.library, retry: notFoundNoRetry });
export const useStudio = () => useQuery({ queryKey: keys.studio, queryFn: fetchers.studio, retry: notFoundNoRetry });
export const useAdmin = () => useQuery({ queryKey: keys.admin, queryFn: fetchers.admin, retry: notFoundNoRetry });

/** Starts loading the data for a route (called on hover/focus/touch of a link). Unknown routes are ignored. */
export function prefetchRoute(qc: QueryClient, href: string) {
  const path = href.split("?")[0];
  let m: RegExpExecArray | null;
  if (path === "/") void qc.prefetchQuery({ queryKey: keys.home, queryFn: fetchers.home, staleTime: 15_000 });
  else if ((m = /^\/show\/([^/]+)$/.exec(path))) void qc.prefetchQuery({ queryKey: keys.show(m[1]), queryFn: () => fetchers.show(m![1]), staleTime: 15_000 });
  else if ((m = /^\/track\/([^/]+)$/.exec(path))) void qc.prefetchQuery({ queryKey: keys.track(m[1]), queryFn: () => fetchers.track(m![1]), staleTime: 15_000 });
  else if ((m = /^\/artist\/([^/]+)$/.exec(path))) void qc.prefetchQuery({ queryKey: keys.artist(m[1]), queryFn: () => fetchers.artist(m![1]), staleTime: 15_000 });
  else if (path === "/discover") void qc.prefetchQuery({ queryKey: keys.discover(""), queryFn: () => fetchers.discover(""), staleTime: 15_000 });
}
