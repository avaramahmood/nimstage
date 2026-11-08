import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BadgeIcon } from "@/components/reaction-icons";
import type { Pass } from "@shared/fanpass";

/** Level, XP and badges: all derived from real activity (see lib/fanpass.ts). */
export function PassCard() {
  const [pass, setPass] = useState<Pass | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ pass: Pass }>("/api/me/pass")
      .then((r) => alive && setPass(r.pass))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;
  if (!pass) return <div aria-hidden="true" className="skeleton h-44 w-full" />;

  const unlocked = pass.badges.filter((b) => b.unlocked).length;
  return (
    <section aria-labelledby="fan-pass" className="card p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="label" id="fan-pass">Fan Pass</h2>
          <p className="display display-md">{pass.levelName}</p>
        </div>
        <p className="font-mono text-sm text-muted">{pass.xp} XP</p>
      </div>

      <div className="mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pass.progress * 100)} aria-label={pass.nextLevelName ? `Progress to ${pass.nextLevelName}` : "Top level reached"}>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full origin-left rounded-full bg-accent transition-transform duration-700" style={{ transform: `scaleX(${pass.progress})` }} />
        </div>
        <p className="mt-2 text-sm text-muted">{pass.nextLevelName && pass.nextAt != null ? `${pass.nextAt - pass.xp} XP to ${pass.nextLevelName}` : "You've reached the top. Legend."}</p>
      </div>

      <h3 className="label mb-2 mt-5">Badges · {unlocked}/{pass.badges.length}</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {pass.badges.map((b) => (
          <li key={b.id} className={`rounded-2xl border p-3 ${b.unlocked ? "border-accent/50 bg-accent/10" : "border-line opacity-60"}`}>
            <BadgeIcon id={b.id} unlocked={b.unlocked} />
            <p className="mt-2 font-medium">{b.name}</p>
            <p className="text-xs text-muted">{b.unlocked ? "Unlocked" : b.hint}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
