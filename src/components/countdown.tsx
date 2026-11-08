import { useEffect, useState } from "react";
import { useRouter } from "@/lib/nav";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Ticks once a second; refreshes the page when the show goes live so the player appears. */
export function Countdown({ to, large = false }: { to: string; large?: boolean }) {
  const router = useRouter();
  const target = new Date(to).getTime();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  useEffect(() => {
    if (left !== null && left <= 0) router.refresh();
  }, [left, router]);

  if (left === null) return <span className="font-mono">--:--:--</span>;
  const { d, h, m, s } = parts(left);
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return (
    <time dateTime={to} className={`font-mono tabular-nums ${large ? "text-3xl" : ""}`} aria-label={`Starts in ${d} days ${h} hours ${m} minutes`}>
      {text}
    </time>
  );
}
