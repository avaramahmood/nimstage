export const LUNA_PER_NIM = 100_000;

export const nimToLuna = (nim: number) => Math.round(nim * LUNA_PER_NIM);
export const lunaToNim = (luna: number) => luna / LUNA_PER_NIM;

/** Nothing on NimStage costs more than this: tickets, tracks, memberships and tips are all small payments. */
export const MAX_NIM = 5;
export const MAX_LUNA = nimToLuna(MAX_NIM);
/** One-tap amounts for the tip sheet. */
export const TIP_PRESETS_NIM = [1, 2, 3, 5] as const;

/** "1,250 NIM", "0.5 NIM", "Free" */
export function formatNim(luna: number, free = "Free"): string {
  if (luna <= 0) return free;
  const nim = lunaToNim(luna);
  return `${nim.toLocaleString("en-US", { maximumFractionDigits: nim < 1 ? 5 : 2 })} NIM`;
}

/** NQ07 0000 ... -> NQ070000... (uppercase, no spaces) for comparisons. */
export const normalizeAddress = (a: string) => a.replace(/\s+/g, "").toUpperCase();

/** "NQ07 0000 0000 ..." -> "NQ07 0000…9ABC" for display. */
export function shortAddress(a: string): string {
  const n = a.replace(/\s+/g, "");
  if (n.length < 12) return a;
  return `${n.slice(0, 4)} ${n.slice(4, 8)}…${n.slice(-4)}`;
}

/** Cheap structural check; real validation happens server-side via @nimiq/core. */
export const looksLikeNimiqAddress = (a: string) =>
  /^NQ\d{2}[0-9A-HJ-NP-Z\s]{30,40}$/i.test(a.trim());
