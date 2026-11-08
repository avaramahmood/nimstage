import { api } from "./api";
import type { Pass } from "@shared/fanpass";

const key = (userId: string) => `ns_badges_${userId}`;

function read(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function write(userId: string, ids: string[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(ids));
  } catch {
    /* private mode: the toast simply won't repeat-protect */
  }
}

async function fetchUnlocked(): Promise<{ ids: string[]; names: Map<string, string> } | null> {
  try {
    const { pass } = await api<{ pass: Pass }>("/api/me/pass");
    const unlocked = pass.badges.filter((b) => b.unlocked);
    return { ids: unlocked.map((b) => b.id), names: new Map(unlocked.map((b) => [b.id, b.name])) };
  } catch {
    return null;
  }
}

/** Records the badges a user already has, so only genuinely new ones trigger an unlock toast later. */
export async function primeBadges(userId: string): Promise<void> {
  if (read(userId)) return;
  const now = await fetchUnlocked();
  if (now) write(userId, now.ids);
}

/** Names of badges unlocked since the last check (and remembers them). */
export async function checkNewBadges(userId: string): Promise<string[]> {
  const prev = read(userId);
  const now = await fetchUnlocked();
  if (!now) return [];
  write(userId, now.ids);
  if (!prev) return [];
  return now.ids.filter((id) => !prev.includes(id)).map((id) => now.names.get(id) ?? id);
}
