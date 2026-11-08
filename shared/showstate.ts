export type ShowState = "upcoming" | "live" | "ended";

/** A show is live between its start and start + duration. Pure, so the server and client always agree. */
export function showState(show: { startsAt: Date | string; durationMin: number }, now = Date.now()): ShowState {
  const start = new Date(show.startsAt).getTime();
  const end = start + show.durationMin * 60_000;
  return now < start ? "upcoming" : now < end ? "live" : "ended";
}
