// Fan Pass: levels, XP and badges, computed from real activity. Pure and dependency-free so it can
// be unit-tested and used on both server and client. Nothing here is stored: it is derived from the
// same tables that already hold tickets, memberships, tips, follows, chat and votes.

export type PassStats = {
  tickets: number; // show tickets owned
  tracks: number; // tracks bought
  memberships: number; // currently active supporter memberships
  tips: number; // confirmed tips sent
  follows: number;
  messages: number; // chat messages sent
  votes: number; // poll votes cast
};

export const EMPTY_STATS: PassStats = { tickets: 0, tracks: 0, memberships: 0, tips: 0, follows: 0, messages: 0, votes: 0 };

export const LEVELS = [
  { at: 0, name: "Opener" },
  { at: 100, name: "Regular" },
  { at: 300, name: "Front Row" },
  { at: 700, name: "Superfan" },
  { at: 1500, name: "Legend" },
] as const;

export type Badge = { id: string; name: string; hint: string; unlocked: boolean };

export type Pass = {
  xp: number;
  level: number; // index into LEVELS
  levelName: string;
  nextLevelName: string | null;
  nextAt: number | null;
  /** 0..1 progress from this level to the next (1 at the top level). */
  progress: number;
  badges: Badge[];
  stats: PassStats;
};

/** XP per action, with caps on the cheap ones so chatting or following can't be farmed. */
export function xpFor(s: PassStats): number {
  return (
    s.tickets * 100 +
    s.tracks * 40 +
    s.memberships * 250 +
    s.tips * 25 +
    Math.min(s.follows, 10) * 10 +
    Math.min(s.messages, 50) * 2 +
    Math.min(s.votes, 10) * 15
  );
}

export function computePass(raw: Partial<PassStats>): Pass {
  const stats = { ...EMPTY_STATS, ...raw };
  const xp = xpFor(stats);
  let level = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].at) level = i;
  const cur = LEVELS[level];
  const next = LEVELS[level + 1] ?? null;
  const progress = next ? (xp - cur.at) / (next.at - cur.at) : 1;
  const badges: Badge[] = [
    { id: "first-ticket", name: "First Ticket", hint: "Buy your first show ticket", unlocked: stats.tickets >= 1 },
    { id: "backer", name: "Backer", hint: "Become a supporter of an artist", unlocked: stats.memberships >= 1 },
    { id: "generous", name: "Generous", hint: "Send 3 tips", unlocked: stats.tips >= 3 },
    { id: "chatterbox", name: "Chatterbox", hint: "Send 10 chat messages", unlocked: stats.messages >= 10 },
    { id: "explorer", name: "Explorer", hint: "Follow 3 artists", unlocked: stats.follows >= 3 },
    { id: "collector", name: "Collector", hint: "Buy 3 tracks", unlocked: stats.tracks >= 3 },
    { id: "voice", name: "Voice", hint: "Vote in a setlist poll", unlocked: stats.votes >= 1 },
  ];
  return {
    xp,
    level,
    levelName: cur.name,
    nextLevelName: next?.name ?? null,
    nextAt: next?.at ?? null,
    progress: Math.max(0, Math.min(1, progress)),
    badges,
    stats,
  };
}
