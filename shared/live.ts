/**
  When may someone join a live video show? Pure, so the server enforces it and the tests pin it down.
  The artist can open the room early to check their camera; viewers only join close to the start.
*/
export type JoinWindow = "ok" | "early" | "ended";
export type LiveRole = "host" | "viewer";

const MIN = 60_000;
const EARLY = { host: 60 * MIN, viewer: 15 * MIN } as const;
const LATE = { host: 60 * MIN, viewer: 30 * MIN } as const; // grace after the scheduled end

export function joinWindow(show: { startsAt: Date | string; durationMin: number }, role: LiveRole, now = Date.now()): JoinWindow {
  const start = new Date(show.startsAt).getTime();
  const end = start + show.durationMin * MIN;
  if (now < start - EARLY[role]) return "early";
  if (now > end + LATE[role]) return "ended";
  return "ok";
}
