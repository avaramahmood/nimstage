import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stepQueue } from "@shared/queue";
import { streamUrl } from "./session";

export type PlayerTrack = { id: string; title: string; artist: string; artistHandle: string; seed: string; cover?: string | null; durationSec: number; showId?: string; previewSec: number };

type Core = {
  track: PlayerTrack | null;
  playing: boolean;
  duration: number;
  preview: boolean;
  previewEnded: boolean;
  error: string | null;
  open: boolean;
  queue: PlayerTrack[];
};

type Actions = {
  play: (t: PlayerTrack, queue?: PlayerTrack[]) => void;
  toggle: () => void;
  seek: (sec: number) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
  setOpen: (o: boolean) => void;
  audio: () => HTMLAudioElement | null;
};

type Ctx = Core & Actions & { hasNext: boolean; hasPrev: boolean };

const PlayerCtx = createContext<Ctx | null>(null);
// The playhead lives in its own context: it changes ~4×/second, and nothing but the full-screen
// player needs it. Keeping it out of the main context stops every track button re-rendering.
const TimeCtx = createContext<number>(0);

export const usePlayer = () => {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error("usePlayer outside PlayerProvider");
  return c;
};
export const usePlayerTime = () => useContext(TimeCtx);

const INITIAL: Core = { track: null, playing: false, duration: 0, preview: false, previewEnded: false, error: null, open: false, queue: [] };
const same = (a: PlayerTrack, b: PlayerTrack) => a.id === b.id && a.showId === b.showId;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [s, setS] = useState<Core>(INITIAL);
  const [current, setCurrent] = useState(0);
  const live = useRef(s); // latest state for event handlers that outlive a render
  useEffect(() => {
    live.current = s;
  }, [s]);

  const hasNext = stepQueue(s.queue, s.track, 1) !== null;
  const hasPrev = stepQueue(s.queue, s.track, -1) !== null;

  const play = useCallback((t: PlayerTrack, queue?: PlayerTrack[]) => {
    const a = el.current;
    if (!a) return;
    const url = streamUrl(t.id, t.showId);
    setCurrent(0);
    setS((x) => ({ ...INITIAL, track: t, duration: t.durationSec, open: x.open, queue: queue?.length ? queue : [t] }));
    // Ask the server whether this listener gets the full file or the preview.
    void fetch(url, { headers: { Range: "bytes=0-0" } })
      .then((r) => setS((x) => (x.track && same(x.track, t) ? { ...x, preview: r.headers.get("x-nimstage-access") === "preview" } : x)))
      .catch(() => {});
    a.src = url;
    a.play().catch(() => setS((x) => ({ ...x, error: "Tap play to start.", playing: false })));
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist });
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      const { track, queue } = live.current;
      if (!track) return;
      const target = stepQueue(queue, track, dir);
      if (target) play(target, queue);
      else if (dir === -1 && el.current) el.current.currentTime = 0;
    },
    [play],
  );

  // One <audio> element for the whole app so playback survives navigation.
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    el.current = a;
    const upd = (p: Partial<Core>) => setS((x) => ({ ...x, ...p }));
    const onPlay = () => upd({ playing: true });
    const onPause = () => upd({ playing: false });
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => Number.isFinite(a.duration) && upd({ duration: a.duration });
    const onEnded = () => {
      const { preview, queue, track } = live.current;
      setCurrent(0);
      if (preview) return upd({ playing: false, previewEnded: true });
      if (stepQueue(queue, track, 1)) step(1); // auto-advance through the list
      else upd({ playing: false });
    };
    const onError = () => upd({ error: "This track couldn't be played.", playing: false });
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    return () => {
      a.pause();
      a.src = "";
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
    };
  }, [step]);

  const toggle = useCallback(() => {
    const a = el.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const seek = useCallback((sec: number) => {
    if (el.current) el.current.currentTime = Math.max(0, sec);
  }, []);

  const close = useCallback(() => {
    el.current?.pause();
    setCurrent(0);
    setS(INITIAL);
  }, []);

  const setOpen = useCallback((open: boolean) => setS((x) => ({ ...x, open })), []);
  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);
  const audio = useCallback(() => el.current, []);

  // Keyboard: space toggles, arrows seek ±10s. Ignored while typing or when a control has focus.
  useEffect(() => {
    if (!s.track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing) return;
      const onControl = !!t && /^(BUTTON|A|SUMMARY)$/.test(t.tagName);
      if (e.code === "Space" && !onControl) {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight" && !onControl) seek((el.current?.currentTime ?? 0) + 10);
      else if (e.code === "ArrowLeft" && !onControl) seek((el.current?.currentTime ?? 0) - 10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.track, toggle, seek]);

  // Lock-screen / headset controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", toggle);
    ms.setActionHandler("pause", toggle);
    ms.setActionHandler("nexttrack", hasNext ? next : null);
    ms.setActionHandler("previoustrack", prev);
    return () => {
      for (const a of ["play", "pause", "nexttrack", "previoustrack"] as const) ms.setActionHandler(a, null);
    };
  }, [toggle, next, prev, hasNext]);

  const value = useMemo<Ctx>(
    () => ({ ...s, play, toggle, seek, next, prev, close, setOpen, audio, hasNext, hasPrev }),
    [s, play, toggle, seek, next, prev, close, setOpen, audio, hasNext, hasPrev],
  );
  return (
    <PlayerCtx.Provider value={value}>
      <TimeCtx.Provider value={current}>{children}</TimeCtx.Provider>
    </PlayerCtx.Provider>
  );
}
