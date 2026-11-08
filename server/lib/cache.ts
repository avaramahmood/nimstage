/**
  A tiny stale-while-revalidate cache for public pages that are the same for everyone (home, discover).
  - Fresh (younger than `freshMs`): served from memory, no database.
  - Stale (younger than `staleMs`): served from memory immediately, and refreshed in the background, so the
    visitor never waits for a database that has gone to sleep (free-tier Postgres suspends when idle).
  - Older or missing: loaded normally.
  Anything an artist or admin changes calls clearCache(), so edits show up straight away.
*/
type Entry = { value: unknown; at: number; refreshing?: Promise<void> };
const store = new Map<string, Entry>();
const MAX_ENTRIES = 50; // discover has a key per search term: keep it bounded

export async function swr<T>(key: string, freshMs: number, staleMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < freshMs) return hit.value as T;
  if (hit && now - hit.at < staleMs) {
    hit.refreshing ??= load()
      .then((value) => void store.set(key, { value, at: Date.now() }))
      .catch(() => {}) // keep serving the old copy if the refresh fails
      .finally(() => {
        const h = store.get(key);
        if (h) h.refreshing = undefined;
      });
    return hit.value as T;
  }
  const value = await load();
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
  store.set(key, { value, at: now });
  return value;
}

export const clearCache = () => store.clear();
