import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { usePlayer, type PlayerTrack } from "@/lib/player";
import { getSpectrum, readBars } from "@/lib/spectrum";
import { Cover } from "@/components/ui";
import type { StageItem, Live } from "./scene";
import type { TicketData } from "./ticket";

/*
  3D is scaled to the device, and never competes with the app starting up:
  - weak devices (few cores or little memory) and devices without WebGL get the plain DOM versions;
  - phones get the 3D at a lighter setting (standard resolution, ~30fps);
  - everyone sees the plain version first, and the 3D loads once the app is interactive and idle, then
    fades in over it. Tapping works from the first second.
*/

const Scene = lazy(() => import("./scene"));
const HeroScene = lazy(() => import("./scene").then((m) => ({ default: m.HeroRecord })));
const TicketScene = lazy(() => import("./ticket"));

type Cap = "ok" | "phone" | "software" | "none";
let capCache: Cap | null = null;
/**
 * What this device can take. "none" = plain versions only (no WebGL, or too weak); "software" = a software
 * rasteriser (SwiftShader, llvmpipe): works but slow; "phone" = a touch device; "ok" = a desktop-class GPU.
 */
function capability(): Cap {
  if (capCache) return capCache;
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.hardwareConcurrency ?? 4) <= 2 || (nav.deviceMemory ?? 4) <= 2) return (capCache = "none");
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return (capCache = "none");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return (capCache = "software");
    return (capCache = window.matchMedia?.("(pointer: coarse)").matches ? "phone" : "ok");
  } catch {
    return (capCache = "none");
  }
}

/* "lite" is shared by every canvas on the page so they step down together. Phones start there. */
let lite = capability() === "software" || capability() === "phone";

/*
  "The app is up": the page has loaded and the browser is idle. Until then only the plain versions are shown,
  so the main thread is free for the first taps. (three.js is ~930 kB and building the scenes takes a while:
  doing that during startup is what made the app answer late.)
*/
let ready = false;
const readySubs = new Set<() => void>();
const markReady = () => {
  if (ready) return;
  ready = true;
  readySubs.forEach((s) => s());
};
if (typeof window !== "undefined") {
  // Also wait for a quiet moment: while someone is tapping or scrolling, building the scenes would make those
  // taps answer late. Gives up waiting after 12 s so the 3D always arrives eventually.
  let lastInput = 0;
  for (const t of ["pointerdown", "touchstart", "keydown", "wheel", "scroll"]) window.addEventListener(t, () => (lastInput = Date.now()), { passive: true, capture: true });
  const giveUpAt = Date.now() + 12_000;
  const whenQuiet = () => {
    if (Date.now() - lastInput < 1500 && Date.now() < giveUpAt) setTimeout(whenQuiet, 500);
    else markReady();
  };
  const settle = () => {
    const done = () => setTimeout(whenQuiet, 400);
    if ("requestIdleCallback" in window) window.requestIdleCallback(done, { timeout: 3000 });
    else setTimeout(done, 1500);
  };
  if (document.readyState === "complete") settle();
  else window.addEventListener("load", settle, { once: true });
}
const useAppReady = () =>
  useSyncExternalStore(
    (cb) => {
      readySubs.add(cb);
      return () => void readySubs.delete(cb);
    },
    () => ready,
    () => ready,
  );

/**
 * Shows `fallback` (the plain version) and, once `active`, fades `children` (the 3D) in over it. Offscreen or
 * not ready, only the fallback is shown. The fallback is made inert once covered, so it can't be tapped through.
 */
function Upgrade({ active, fallback, children }: { active: boolean; fallback: ReactNode; children: ReactNode }) {
  return active ? <Layers fallback={fallback}>{children}</Layers> : <div className="absolute inset-0 grid place-items-center [&>*]:w-full">{fallback}</div>;
}
function Layers({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <div inert={shown} aria-hidden={shown} className={`absolute inset-0 grid place-items-center transition-opacity duration-500 [&>*]:w-full ${shown ? "opacity-0" : "opacity-100"}`}>
        {fallback}
      </div>
      <div className={`absolute inset-0 transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}>{children}</div>
    </>
  );
}
const subs = new Set<() => void>();
const setLite = () => {
  if (lite) return;
  lite = true;
  subs.forEach((s) => s());
};
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};
const useLite = () => useSyncExternalStore(subscribe, () => lite, () => lite);
const onSlow = (l: 1 | 2) => l === 2 && setLite();

/** Is the element near the viewport, and is the tab in front? 3D only draws when both are true. */
function useShown(box: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState(true);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    if (io) io.observe(el);
    else setTimeout(() => setVisible(true), 0);
    const vis = () => setTab(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [box]);
  return { visible, tab };
}

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useLive(): Live {
  const player = usePlayer();
  const live = useRef<Live>({ level: 0, playing: false }).current;
  live.playing = player.playing;
  return live;
}

/** The grabbable record for the top of the home page. `fallback` shows only when WebGL is missing. */
export function HeroDisc({ seed, image, fallback }: { seed: string; image?: string | null; fallback: ReactNode }) {
  const live = useLive();
  const l = useLite();
  const box = useRef<HTMLDivElement>(null);
  const { visible, tab } = useShown(box);
  const up = useAppReady();
  const ok = capability() !== "none";
  return (
    <div ref={box} className="relative mx-auto aspect-square w-full max-w-[480px]">
      {!ok ? (
        fallback
      ) : (
        <Upgrade active={visible && up} fallback={fallback}>
          <Suspense fallback={null}>
            <HeroScene seed={seed} image={image} live={live} active={tab} still={reduced()} lite={l} onSlow={onSlow} />
          </Suspense>
        </Upgrade>
      )}
    </div>
  );
}

/** The ticket as a real 3D object: drag to flip it, it tilts toward the pointer, glare follows. */
export function Ticket3D({ title, meta, price, serial, fallback }: TicketData & { fallback: ReactNode }) {
  const l = useLite();
  const box = useRef<HTMLDivElement>(null);
  const { visible, tab } = useShown(box);
  const up = useAppReady();
  const data = useMemo(() => ({ title, meta, price, serial }), [title, meta, price, serial]);
  if (capability() === "none") return <>{fallback}</>;
  return (
    <div ref={box} className="relative mx-auto aspect-[16/10] w-full max-w-[560px]">
      <p className="sr-only">
        Ticket: {title}, {meta}, {price}. Admit one, {serial}.
      </p>
      <Upgrade active={visible && up} fallback={fallback}>
        <Suspense fallback={null}>
          <TicketScene data={data} active={tab} still={reduced()} lite={l} onSlow={onSlow} />
        </Suspense>
      </Upgrade>
    </div>
  );
}

type Props = {
  artists: { id: string; handle: string; name: string; genre: string; avatarKey?: string | null }[];
  tracks: { track: { id: string; title: string; durationSec: number; previewSec: number; coverKey?: string | null }; artist: { name: string; handle: string } }[];
};

/** Ribbons + a ring of every artist and track. Borderless and edge-faded so it melts into the page. */
export function Stage({ artists, tracks }: Props) {
  const nav = useNavigate();
  const player = usePlayer();
  const live = useLive();
  const l = useLite();
  const box = useRef<HTMLDivElement>(null);
  const { visible, tab } = useShown(box);
  const up = useAppReady();

  // audio level for the ribbons, sampled ~15×/s from the same analyser the player uses
  useEffect(() => {
    if (!visible || !player.playing) {
      live.level = 0;
      return;
    }
    const id = window.setInterval(() => {
      const a = player.audio();
      const g = a ? getSpectrum(a) : null;
      if (g) {
        const bars = readBars(g, 12);
        live.level = bars.reduce((s, v) => s + v, 0) / bars.length;
      } else live.level = 0.35 + 0.25 * Math.sin(Date.now() / 260); // analyser unavailable: gentle pulse
    }, 66);
    return () => window.clearInterval(id);
  }, [visible, player, live]);

  const items = useMemo<StageItem[]>(() => {
    const list: PlayerTrack[] = tracks.map(({ track, artist }) => ({ id: track.id, title: track.title, artist: artist.name, artistHandle: artist.handle, seed: track.id, cover: track.coverKey, durationSec: track.durationSec, previewSec: track.previewSec }));
    const out: StageItem[] = [];
    const n = Math.max(artists.length, tracks.length);
    for (let i = 0; i < n; i++) {
      const a = artists[i];
      if (a) out.push({ key: `a-${a.id}`, kind: "artist", label: a.name, sub: a.genre, seed: a.id, image: a.avatarKey, onOpen: () => nav(`/artist/${a.handle}`) });
      const t = tracks[i];
      if (t) out.push({ key: `t-${t.track.id}`, kind: "track", label: t.track.title, sub: `♪ ${t.artist.name}`, seed: t.track.id, image: t.track.coverKey, onOpen: () => player.play(list[i], list) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artists, tracks, nav, player.play]);

  const ok = capability() !== "none";
  return (
    <section aria-label="Interactive stage" className="relative -mx-2 sm:-mx-4 lg:left-1/2 lg:mx-0 lg:w-[min(calc(100vw-var(--rail)-32px),1180px)] lg:-translate-x-1/2">
      <div ref={box} className="relative h-[290px] md:h-[380px] lg:h-[460px] xl:h-[500px] [mask-image:linear-gradient(to_bottom,transparent,#000_16%,#000_84%,transparent)]">
        {ok ? (
          <Upgrade active={visible && up} fallback={<Flat items={items} />}>
            <Suspense fallback={null}>
              <Scene items={items} live={live} active={tab} still={reduced()} lite={l} onSlow={onSlow} />
            </Suspense>
          </Upgrade>
        ) : (
          <Flat items={items} />
        )}
      </div>
    </section>
  );
}

/** The same tiles without WebGL: a scrollable row of real buttons, so nothing is lost. */
function Flat({ items }: { items: StageItem[] }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="rail">
        {items.map((it) => (
          <button key={it.key} type="button" onClick={it.onOpen} className="lift card w-[150px] shrink-0 p-3 text-left">
            <Cover seed={it.seed} image={it.image} className={`aspect-square w-full ${it.kind === "artist" ? "rounded-full" : "rounded-xl"}`} />
            <span className="mt-2 block truncate font-medium">{it.label}</span>
            <span className="block truncate text-xs text-muted">{it.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
