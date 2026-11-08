import { Link } from "@/components/link";
import { useEffect, useRef } from "react";
import { Lock, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, X } from "lucide-react";
import { usePlayer, usePlayerTime, type PlayerTrack } from "@/lib/player";
import { getSpectrum, readBars } from "@/lib/spectrum";
import { Cover, Eq } from "@/components/ui";
import { fmtDuration } from "@shared/format";
import { Sheet } from "@/components/sheet";

function wave(seed: string, n = 56): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    return 0.22 + 0.78 * Math.abs(Math.sin(i / 5.5) * 0.55 + r * 0.45);
  });
}

export function PlayToggle({ track, queue, label }: { track: PlayerTrack; queue?: PlayerTrack[]; label?: string }) {
  const p = usePlayer();
  const active = p.track?.id === track.id && p.track?.showId === track.showId;
  const playing = active && p.playing;
  return (
    <button
      type="button"
      aria-label={`${playing ? "Pause" : "Play"} ${label ?? track.title}`}
      onClick={() => (active ? p.toggle() : p.play(track, queue))}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all duration-300 hover:scale-105 active:scale-95 ${playing ? "border-accent bg-accent text-accent-ink" : "border-line bg-white/[0.06] hover:bg-white/[0.12]"}`}
    >
      {playing ? <Pause aria-hidden="true" size={18} fill="currentColor" /> : <Play aria-hidden="true" size={18} fill="currentColor" className="translate-x-px" />}
    </button>
  );
}

/** Tracklist row. Passing `queue` makes the list play through, one track after the next. */
export function TrackRow({
  index,
  track,
  artist,
  priceLabel,
  locked,
  showId,
  queue,
  action,
}: {
  index: number;
  track: { id: string; title: string; durationSec: number; previewSec: number };
  artist: { name: string; handle: string };
  priceLabel: string;
  locked: boolean;
  showId?: string;
  queue?: PlayerTrack[];
  action?: React.ReactNode;
}) {
  const p = usePlayer();
  const active = p.track?.id === track.id;
  const pt: PlayerTrack = { id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, durationSec: track.durationSec, previewSec: track.previewSec, showId };
  return (
    <li className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
      <Cover seed={track.id} className="h-10 w-10 rounded-xl" />
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-medium">
          {active && p.playing && <Eq />}
          <span className="truncate">{track.title}</span>
        </p>
        <p className="flex items-center gap-1 truncate text-sm text-muted">
          {locked && <Lock aria-hidden="true" size={12} />}
          {locked ? `Preview ${track.previewSec}s · ${priceLabel}` : `${fmtDuration(track.durationSec)} · ${priceLabel}`}
          <span className="sr-only"> track {index + 1}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <PlayToggle track={pt} queue={queue} />
      </div>
    </li>
  );
}

export function MiniPlayer() {
  const p = usePlayer();
  if (!p.track) return null;
  return (
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-24px)] max-w-[496px] -translate-x-1/2 items-center gap-2 rounded-[24px] border border-line bg-surface-2 py-2 pl-3 pr-2 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)]">
      <button type="button" onClick={() => p.setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left" aria-label={`Open player, ${p.track.title} by ${p.track.artist}`}>
        <Cover seed={p.track.seed} className="h-12 w-12 shrink-0 rounded-xl" />
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-medium">
            <Eq paused={!p.playing} />
            <span className="truncate">{p.track.title}</span>
          </span>
          <span className="block truncate text-sm text-muted">{p.previewEnded ? "Preview over · unlock to keep listening" : `${p.track.artist}${p.preview ? " · preview" : ""}`}</span>
        </span>
      </button>
      {p.hasPrev && (
        <button type="button" aria-label="Previous track" onClick={p.prev} className="hidden h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-ink sm:grid">
          <SkipBack aria-hidden="true" size={18} fill="currentColor" />
        </button>
      )}
      <button type="button" aria-label={p.playing ? "Pause" : "Play"} onClick={p.toggle} className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink transition-transform hover:scale-105 active:scale-95">
        {p.playing ? <Pause aria-hidden="true" size={20} fill="currentColor" /> : <Play aria-hidden="true" size={20} fill="currentColor" className="translate-x-px" />}
      </button>
      {p.hasNext && (
        <button type="button" aria-label="Next track" onClick={p.next} className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-ink">
          <SkipForward aria-hidden="true" size={18} fill="currentColor" />
        </button>
      )}
      <button type="button" aria-label="Close player" onClick={p.close} className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-ink">
        <X aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

const BARS = 40;

/**
 * Live spectrum on a canvas. Draws at ~30fps and only while the sheet is open and audio is playing.
 * If the Web Audio graph can't be created, it renders nothing and the static waveform below stays.
 */
function Spectrum({ playing }: { playing: boolean }) {
  const p = usePlayer();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const audio = p.audio();
    if (!c || !audio) return;
    const g = getSpectrum(audio);
    if (!g) {
      c.style.display = "none"; // Web Audio unavailable: the static waveform below stays
      return;
    }
    const ctx2d = c.getContext("2d");
    if (!ctx2d) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    ctx2d.scale(dpr, dpr);
    const grad = ctx2d.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, "#fa5d29");
    grad.addColorStop(1, "#49b3fc");
    void g.ctx.resume().catch(() => {});

    let raf = 0;
    let last = 0;
    const gap = 4;
    const bw = (w - gap * (BARS - 1)) / BARS;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return; // ~30fps
      last = t;
      const bars = playing ? readBars(g, BARS) : Array.from({ length: BARS }, () => 0.04);
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.fillStyle = grad;
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(3, bars[i] * h);
        ctx2d.beginPath();
        ctx2d.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(bw / 2, 3));
        ctx2d.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p, playing]);

  return <canvas ref={canvas} aria-hidden="true" className="mt-4 h-16 w-full" />;
}

export function PlayerSheet() {
  const p = usePlayer();
  const current = usePlayerTime();
  const t = p.track;
  if (!t) return null;
  const cap = p.preview ? Math.min(t.previewSec, p.duration || t.durationSec) : p.duration || t.durationSec;
  const bars = wave(t.seed);
  const pct = cap ? Math.min(1, current / cap) : 0;

  return (
    <Sheet open={p.open} onClose={() => p.setOpen(false)} title={t.title} label="Now playing">
      <div className="grid place-items-center py-2">
        <div
          aria-hidden="true"
          className={`vinyl ${p.playing ? "playing" : ""} grid h-48 w-48 place-items-center rounded-full shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)]`}
          style={{ background: "repeating-radial-gradient(circle, #1a1a22 0 2px, #101016 2px 4px)" }}
        >
          <Cover seed={t.seed} className="h-[34%] w-[34%] rounded-full" />
        </div>
      </div>

      <p className="mt-3 text-muted">
        <Link href={`/artist/${t.artistHandle}`} onClick={() => p.setOpen(false)} className="underline decoration-2 underline-offset-4">
          {t.artist}
        </Link>
        {p.queue.length > 1 && <span className="ml-2 font-mono text-xs">{p.queue.findIndex((q) => q.id === t.id && q.showId === t.showId) + 1} / {p.queue.length}</span>}
      </p>

      {(p.preview || p.previewEnded) && (
        <div className="mt-3 rounded-2xl border border-blue/40 bg-blue/10 p-3 text-sm">
          <p className="font-medium text-blue">{p.previewEnded ? "Preview over" : "You're hearing a preview"}</p>
          <p className="text-muted">Buy the ticket or track, or become a supporter, to hear the whole thing.</p>
        </div>
      )}

      {p.open && <Spectrum playing={p.playing} />}

      <div className="relative mt-3 h-12">
        <div aria-hidden="true" className="absolute inset-0 flex items-end gap-[3px]">
          {bars.map((h, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: `${h * 100}%`, background: i / bars.length <= pct ? "var(--accent)" : "rgb(255 255 255 / 0.14)" }} />
          ))}
        </div>
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={Math.max(1, Math.floor(cap))}
          value={Math.floor(current)}
          onChange={(e) => p.seek(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-xs text-muted" aria-hidden="true">
        <span>{fmtDuration(current)}</span>
        <span>{fmtDuration(cap)}</span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button type="button" aria-label="Previous track" disabled={!p.hasPrev} onClick={p.prev} className="grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] disabled:opacity-30">
          <SkipBack aria-hidden="true" size={20} fill="currentColor" />
        </button>
        <button type="button" aria-label="Back 15 seconds" onClick={() => p.seek(current - 15)} className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white/[0.04] transition-colors hover:bg-white/[0.1]">
          <RotateCcw aria-hidden="true" size={20} />
        </button>
        <button type="button" aria-label={p.playing ? "Pause" : "Play"} onClick={p.toggle} className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_14px_34px_-10px_rgb(250_93_41/0.8)] transition-transform hover:scale-105 active:scale-95">
          {p.playing ? <Pause aria-hidden="true" size={28} fill="currentColor" /> : <Play aria-hidden="true" size={28} fill="currentColor" className="translate-x-0.5" />}
        </button>
        <button type="button" aria-label="Forward 15 seconds" onClick={() => p.seek(current + 15)} className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white/[0.04] transition-colors hover:bg-white/[0.1]">
          <RotateCw aria-hidden="true" size={20} />
        </button>
        <button type="button" aria-label="Next track" disabled={!p.hasNext} onClick={p.next} className="grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] disabled:opacity-30">
          <SkipForward aria-hidden="true" size={20} fill="currentColor" />
        </button>
      </div>
      {p.error && (
        <p role="alert" className="mt-3 text-danger">
          {p.error}
        </p>
      )}
    </Sheet>
  );
}
