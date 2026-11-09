// "For you": the artists you follow, shown first. One query feeds the Home row, the live banner and the dot on Me;
// it refreshes every ~20 s while the app is open and you are signed in.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Serialized } from "@shared/types";
import type { forYouView } from "@srv/views";
import { api } from "./api";
import { useWallet } from "./wallet";

export type ForYouView = Serialized<Awaited<ReturnType<typeof forYouView>>>;

const SEEN = "ns_foryou_seen";
const DISMISSED = "ns_live_dismissed";

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the dot simply won't remember */
  }
};

/** When the user last looked at their updates. The first ever visit counts as "seen", so a new account starts with no dot. */
export function lastSeen(): string {
  const v = read(SEEN);
  if (v) return v;
  const now = new Date().toISOString();
  write(SEEN, now);
  return now;
}

export function useForYou() {
  const { me } = useWallet();
  return useQuery({
    queryKey: ["foryou", me?.user?.id ?? null],
    queryFn: () => api<ForYouView>(`/api/me/foryou?since=${encodeURIComponent(lastSeen())}`),
    enabled: !!me?.user,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

/** Marks everything as seen (clears the dot on Me). */
export function useMarkSeen() {
  const qc = useQueryClient();
  return useCallback(() => {
    write(SEEN, new Date().toISOString());
    void qc.invalidateQueries({ queryKey: ["foryou"] });
  }, [qc]);
}

/** Shows whose "live now" banner the user closed, so it doesn't come back on the next refresh. */
export const dismissedLive = (): string[] => {
  try {
    return JSON.parse(read(DISMISSED) ?? "[]") as string[];
  } catch {
    return [];
  }
};
export const dismissLive = (showId: string) => write(DISMISSED, JSON.stringify([...new Set([...dismissedLive(), showId])].slice(-30)));

/** Followed artists first, otherwise the order given. */
export function followedFirst<T>(items: T[], ids: string[] | undefined, artistId: (item: T) => string): T[] {
  if (!ids?.length) return items;
  const set = new Set(ids);
  return [...items].sort((a, b) => Number(set.has(artistId(b))) - Number(set.has(artistId(a))));
}
