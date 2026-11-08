/**
  The last public page the app showed (home, discover), kept on the device so the next launch paints at once and
  refreshes in the background, instead of waiting on the network. Public data only: nothing personal is stored
  here. A copy is ignored if it came from a different build (the code may expect a different shape) or is old.
*/
const KEY = "ns_cache";
const MAX_AGE = 24 * 60 * 60 * 1000;
const build = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

type Saved<T> = { at: number; data: T };

export function readSaved<T>(name: string): Saved<T> | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "null") as { build: string; items: Record<string, Saved<T>> } | null;
    const hit = all?.build === build ? all.items[name] : undefined;
    return hit && Date.now() - hit.at < MAX_AGE ? hit : undefined;
  } catch {
    return undefined;
  }
}

export function writeSaved<T>(name: string, data: T) {
  try {
    // A damaged value must not stop us saving a good one: treat it as empty.
    let raw: { build: string; items: Record<string, Saved<unknown>> } | null = null;
    try {
      raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      raw = null;
    }
    const items = raw?.build === build && raw.items ? raw.items : {};
    items[name] = { at: Date.now(), data };
    localStorage.setItem(KEY, JSON.stringify({ build, items }));
  } catch {
    /* storage full or blocked: fine, it's only a speed-up */
  }
}
