import { useEffect, useState } from "react";
import { showState, type ShowState } from "@shared/showstate";

/** Current time, refreshed on an interval, so "live" / "upcoming" labels never go stale on a long-open page. */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function useShowState(show: { startsAt: string; durationMin: number }): ShowState {
  return showState(show, useNow());
}

/** Sets the browser tab title for a page. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · NimStage` : "NimStage";
  }, [title]);
}
