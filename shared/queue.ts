// Queue stepping for the player, as a pure function so it can be tested without React or audio.

export type QueueItem = { id: string; showId?: string };

const same = (a: QueueItem, b: QueueItem) => a.id === b.id && a.showId === b.showId;

/** Index of `current` in the queue, or -1. */
export const queueIndex = (queue: QueueItem[], current: QueueItem | null) => (current ? queue.findIndex((q) => same(q, current)) : -1);

/** The track one step ahead (dir = 1) or behind (dir = -1) of `current`, or null at either end / if `current` isn't queued. */
export function stepQueue<T extends QueueItem>(queue: T[], current: QueueItem | null, dir: 1 | -1): T | null {
  const i = queueIndex(queue, current);
  if (i < 0) return null;
  return queue[i + dir] ?? null;
}
