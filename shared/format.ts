import type { CSSProperties } from "react";

// Pure helpers, safe to import from both server and client components.

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Tints of the two brand accents (orange / blue) plus ivory: used to build cover art. */
const TINTS = ["#fa5d29", "#ff8a5c", "#49b3fc", "#7cc8ff", "#f4f0e8", "#c9482a"];

/** Three distinct tints for a seed. Uses `>>>` so indexes are never negative. */
export function coverColors(seed: string): [string, string, string] {
  const h = hash(seed);
  const i = h % TINTS.length;
  const j = (i + 1 + ((h >>> 3) % (TINTS.length - 1))) % TINTS.length; // always != i
  const k = (j + 1 + ((h >>> 6) % (TINTS.length - 1))) % TINTS.length; // always != j
  return [TINTS[i], TINTS[j], TINTS[k]];
}

/** Soft gradient-mesh cover art from a seed: no stock images, no copyright, no layout shift. */
export function coverStyle(seed: string): CSSProperties {
  const h = hash(seed);
  const [a, b, c] = coverColors(seed);
  const p = (n: number) => 8 + ((h >>> n) % 84);
  return {
    background: [
      `radial-gradient(75% 80% at ${p(0)}% ${p(5)}%, ${a} 0%, transparent 78%)`,
      `radial-gradient(80% 75% at ${p(10)}% ${p(15)}%, ${b} 0%, transparent 80%)`,
      `radial-gradient(90% 90% at ${p(20)}% ${p(25)}%, ${c}cc 0%, transparent 82%)`,
      "#14141f",
    ].join(", "),
  };
}

export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtWhen(d: Date | string) {
  return new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
