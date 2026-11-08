// Small, cheap delight: haptics and a one-shot celebration burst. Everything here is optional
// decoration: it never blocks, never throws, and is skipped under prefers-reduced-motion.

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported: fine */
  }
}

const COLORS = ["#fa5d29", "#ff8a5c", "#49b3fc", "#7cc8ff", "#f4f0e8"];

/** A burst of confetti from the middle of the screen. DOM nodes animate transform+opacity only and remove themselves. */
export function celebrate(count = 26) {
  haptic([18, 40, 18]);
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (document.querySelectorAll(".confetto").length > 60) return; // never pile up
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.className = "confetto";
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 200;
    el.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    el.style.setProperty("--y", `${Math.sin(angle) * dist * 0.8 - 40}px`);
    el.style.setProperty("--r", `${(Math.random() - 0.5) * 900}deg`);
    el.style.background = COLORS[i % COLORS.length];
    el.addEventListener("animationend", () => el.remove(), { once: true });
    document.body.appendChild(el);
  }
}
