import { useEffect, useRef, useState, type ReactNode } from "react";
import { Room, RoomEvent, Track, createLocalTracks, type LocalTrack, type LocalVideoTrack, type RemoteTrack } from "livekit-client";
import { Camera, CameraOff, Copy, Maximize2, Mic, MicOff, Radio, RefreshCcw, Square, Volume2 } from "lucide-react";
import { Eq } from "@/components/ui";
import { useToast } from "@/components/toast";
import { TipButton } from "@/components/pay";
import { LiveOverlay, type LiveArtist } from "@/components/live-overlay";
import type { LiveRoomState } from "@/components/live-room";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";

/*
  Live video, via LiveKit. The server decides who may join and whether they can publish (the artist) or
  only watch (everyone with access); this file just connects with the token it is given.
  A stream can be video + audio, audio only (a music show needs no picture) or video only.
  It sits inline on the show page and opens full screen like an Instagram Live: the picture fills the
  screen (a portrait stream fills a phone; a landscape one is letterboxed), with chat and reactions over it.
  Loaded lazily from the show page, so the SDK never weighs on pages without video.
*/

type Join = { token: string; url: string; role: "host" | "viewer" };

/** Full screen on/off. While on, the page behind doesn't scroll and Escape leaves. */
function useFull() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      removeEventListener("keydown", onKey);
    };
  }, [full]);
  return [full, setFull] as const;
}

/** The frame the picture lives in: a card on the page, or the whole screen. The <video> inside never moves, so the stream never reconnects. */
function Frame({ full, portrait, children, label }: { full: boolean; portrait: boolean; children: ReactNode; label: string }) {
  const inline = `relative w-full overflow-hidden rounded-[20px] bg-black ${portrait ? "mx-auto aspect-[4/5] max-h-[78dvh]" : "aspect-video"}`;
  return (
    <div role={full ? "dialog" : undefined} aria-modal={full ? true : undefined} aria-label={full ? label : undefined} className={full ? "fixed inset-0 z-[70] h-dvh w-screen bg-black" : inline}>
      {children}
    </div>
  );
}

const Chip = ({ live, children }: { live?: boolean; children: ReactNode }) => <span className={`sticker ${live ? "" : "sticker-cream"}`}>{children}</span>;

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
      <div>
        <p className="display display-sm">{title}</p>
        {body && <p className="mt-2 text-white/70">{body}</p>}
      </div>
    </div>
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** What the browser's media errors actually mean, in words an artist can act on. */
function explainMediaError(e: unknown): string {
  const name = (e as Error)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "This app isn't allowed to use your camera or microphone. Allow it in your phone's Settings → Apps → Nimiq Pay → Permissions, then try again. If that doesn't work, open this page in your phone's or computer's browser and go live from there.";
  if (name === "NotReadableError" || /could not start|audio source|video source/i.test((e as Error)?.message ?? ""))
    return "Your device wouldn't start the microphone or camera. Another app may be using it, or this app doesn't have permission (Settings → Apps → Nimiq Pay → Permissions).";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found on this device.";
  return errText(e);
}

type Common = { showId: string; room: LiveRoomState; artist: LiveArtist; title: string };

/* ------------------------------- viewer ------------------------------- */

function Viewer({ showId, open, room, artist, title }: Common & { open: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [media, setMedia] = useState({ video: false, audio: false });
  const [error, setError] = useState("");
  const [needAudio, setNeedAudio] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [full, setFull] = useFull();

  useEffect(() => {
    if (!open) return;
    let dead = false;
    const lk = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = lk;
    const audioEls = audioBox.current;
    const have = { video: 0, audio: 0 }; // subscribed tracks by kind: the stream is live while there is any
    const sync = () => {
      setMedia({ video: have.video > 0, audio: have.audio > 0 });
      setPhase((p) => (have.video + have.audio > 0 ? "live" : p === "live" ? "waiting" : p));
    };

    const attach = (t: RemoteTrack) => {
      if (t.kind === Track.Kind.Video && video.current) {
        t.attach(video.current);
        have.video++;
      } else if (t.kind === Track.Kind.Audio) {
        audioEls?.appendChild(t.attach());
        have.audio++;
      }
      sync();
    };
    lk.on(RoomEvent.TrackSubscribed, attach)
      .on(RoomEvent.TrackUnsubscribed, (t) => {
        t.detach();
        if (t.kind === Track.Kind.Video) have.video = Math.max(0, have.video - 1);
        else if (t.kind === Track.Kind.Audio) have.audio = Math.max(0, have.audio - 1);
        sync();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedAudio(!lk.canPlaybackAudio))
      .on(RoomEvent.Disconnected, () => !dead && setPhase("ended"));

    void (async () => {
      try {
        const j = await api<Join>(`/api/shows/${showId}/live/token`, {});
        if (dead) return;
        await lk.connect(j.url, j.token);
        if (dead) return lk.disconnect();
        setPhase((p) => (p === "live" ? p : "waiting"));
      } catch (e) {
        if (dead) return;
        setError(errText(e));
        setPhase("error");
      }
    })();

    return () => {
      dead = true;
      lk.disconnect();
      roomRef.current = null;
    };
  }, [showId, open]);

  if (!open) {
    return (
      <Frame full={false} portrait={false} label="">
        <Message title="The video room opens shortly before the show" body="Come back at the start time." />
      </Frame>
    );
  }
  const live = phase === "live";
  const audioOnly = live && media.audio && !media.video;
  const chip = live ? <Chip live>{audioOnly ? "Live · audio" : "Live"}</Chip> : undefined;
  const fit = full ? (portrait ? "object-cover md:object-contain" : "object-contain") : "object-contain";
  return (
    <div className="grid gap-3" aria-live="polite">
      <Frame full={full} portrait={portrait && media.video} label={`${title}, live`}>
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
          onResize={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
          onClick={() => live && !full && setFull(true)}
          className={`h-full w-full ${fit} ${live && media.video ? "" : "hidden"} ${live && !full ? "cursor-zoom-in" : ""}`}
          aria-label="Live video"
        />
        {audioOnly && (
          <div className="absolute inset-0 grid place-items-center text-center text-white">
            <div className="grid justify-items-center gap-3">
              <span className="scale-[2.2]"><Eq /></span>
              <p className="display display-sm mt-4">Audio only</p>
              <p className="text-white/70">The artist is playing live without video.</p>
            </div>
          </div>
        )}
        {phase === "connecting" && <Message title="Connecting…" />}
        {phase === "waiting" && <Message title="Waiting for the artist" body="The stream starts when they go live. You can stay on this page." />}
        {phase === "ended" && <Message title="The stream has ended" body="Thanks for watching." />}
        {phase === "error" && <Message title="Couldn't join the stream" body={error} />}

        {!full && (
          <>
            {chip && <div className="absolute left-3 top-3 z-10">{chip}</div>}
            {live && (
              <button type="button" onClick={() => setFull(true)} aria-label="Watch full screen" className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm">
                <Maximize2 aria-hidden="true" size={16} /> Full screen
              </button>
            )}
          </>
        )}
        {full && (
          <LiveOverlay
            room={room}
            artist={artist}
            title={title}
            chip={chip}
            onClose={() => setFull(false)}
            tip={<TipButton target={showId} artistName={artist.name} className="btn btn-blue min-h-12 shrink-0 rounded-full" />}
          />
        )}
      </Frame>
      <div ref={audioBox} className="hidden" />
      {needAudio && phase !== "error" && (
        <button type="button" className="btn btn-blue" onClick={() => void roomRef.current?.startAudio().then(() => setNeedAudio(false))}>
          <Volume2 aria-hidden="true" size={18} /> Tap to hear the stream
        </button>
      )}
    </div>
  );
}

/* --------------------------------- host --------------------------------- */

const roundBtn = "grid h-12 w-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm";

function Host({ showId, room, artist, title }: Common) {
  const toast = useToast();
  const { inNimiqPay } = useWallet();
  const preview = useRef<HTMLVideoElement>(null);
  const tracks = useRef<LocalTrack[]>([]);
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<"idle" | "preview" | "connecting" | "live" | "ended">("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [has, setHas] = useState({ audio: false, video: false });
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [portrait, setPortrait] = useState(false);
  const [full, setFull] = useFull();

  const stopTracks = () => {
    tracks.current.forEach((t) => t.stop());
    tracks.current = [];
  };
  useEffect(
    () => () => {
      stopTracks();
      roomRef.current?.disconnect();
    },
    [],
  );

  /** Camera + mic if possible; otherwise whichever one works, and say so. Never an all-or-nothing failure. */
  async function startPreview() {
    setError("");
    setNote("");
    // A phone held upright films portrait, like an Instagram Live; a computer's webcam stays landscape.
    const phoneLike = matchMedia("(pointer: coarse)").matches;
    const video = { facingMode: facing, ...(phoneLike ? { resolution: { width: 720, height: 1280, frameRate: 30 } } : {}) };
    const tries = [
      { opts: { audio: true, video }, note: "" },
      { opts: { audio: true, video: false as const }, note: "Your camera isn't available, so you'll stream audio only. That works fine for music: viewers hear you but don't see you." },
      { opts: { audio: false, video }, note: "Your microphone isn't available, so viewers will see you but not hear you. Fix the microphone permission before you go live." },
    ];
    let first: unknown = null;
    for (const t of tries) {
      try {
        const local = await createLocalTracks(t.opts);
        tracks.current = local;
        const v = local.find((x) => x.kind === Track.Kind.Video);
        if (v && preview.current) v.attach(preview.current);
        setHas({ audio: local.some((x) => x.kind === Track.Kind.Audio), video: !!v });
        setMic(true);
        setCam(true);
        setNote(t.note);
        setPhase("preview");
        setFull(true); // straight into the full-screen studio
        return;
      } catch (e) {
        first ??= e;
      }
    }
    setError(explainMediaError(first));
  }

  async function goLive() {
    setError("");
    setPhase("connecting");
    try {
      const j = await api<Join>(`/api/shows/${showId}/live/token`, {});
      const lk = new Room();
      roomRef.current = lk;
      lk.on(RoomEvent.Disconnected, () => setPhase((p) => (p === "live" ? "ended" : p)));
      await lk.connect(j.url, j.token);
      for (const t of tracks.current) await lk.localParticipant.publishTrack(t);
      setPhase("live");
    } catch (e) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setError(errText(e));
      setPhase("preview");
    }
  }

  async function end() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    stopTracks();
    setPhase("ended");
    setFull(false);
    try {
      await api(`/api/shows/${showId}/live/end`, {});
    } catch {
      /* already closed */
    }
  }

  const toggle = (kind: Track.Kind, on: boolean, set: (v: boolean) => void) => {
    const t = tracks.current.find((x) => x.kind === kind);
    if (!t) return;
    if (on) void t.mute();
    else void t.unmute();
    set(!on);
  };

  /** Front/back camera, without interrupting the stream. */
  async function flip() {
    const t = tracks.current.find((x) => x.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
    if (!t) return;
    const next = facing === "user" ? "environment" : "user";
    try {
      await t.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      toast("This device has only one camera.", "error");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied. Paste it into your browser.", "ok");
    } catch {
      toast("Couldn't copy. Open this page in your browser instead.", "error");
    }
  }
  async function shareLink() {
    try {
      await navigator.share({ title, url: location.href });
    } catch {
      /* closed without choosing: nothing to do */
    }
  }
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const showVideo = (phase === "preview" || phase === "connecting" || phase === "live") && has.video;
  const chip = phase === "live" ? <Chip live>You're live{!has.video ? " · audio" : ""}</Chip> : phase === "preview" || phase === "connecting" ? <Chip>Preview</Chip> : undefined;
  const controls = (
    <>
      {has.audio && (
        <button type="button" className={roundBtn} aria-pressed={!mic} aria-label={mic ? "Mute microphone" : "Unmute microphone"} onClick={() => toggle(Track.Kind.Audio, mic, setMic)}>
          {mic ? <Mic aria-hidden="true" size={20} /> : <MicOff aria-hidden="true" size={20} />}
        </button>
      )}
      {has.video && (
        <>
          <button type="button" className={roundBtn} aria-pressed={!cam} aria-label={cam ? "Turn camera off" : "Turn camera on"} onClick={() => toggle(Track.Kind.Video, cam, setCam)}>
            {cam ? <Camera aria-hidden="true" size={20} /> : <CameraOff aria-hidden="true" size={20} />}
          </button>
          <button type="button" className={roundBtn} aria-label="Switch camera" onClick={() => void flip()}>
            <RefreshCcw aria-hidden="true" size={20} />
          </button>
        </>
      )}
      {(phase === "preview" || phase === "connecting") && (
        <button type="button" className="btn btn-primary min-h-12 rounded-full px-6" disabled={phase === "connecting"} onClick={() => void goLive()}>
          <Radio aria-hidden="true" size={18} /> {phase === "connecting" ? "Going live…" : "Go live"}
        </button>
      )}
      {phase === "live" && (
        <button type="button" className="btn min-h-12 rounded-full bg-danger px-6 text-white" onClick={() => void end()}>
          <Square aria-hidden="true" size={16} /> End stream
        </button>
      )}
    </>
  );

  return (
    <div className="grid gap-3" aria-live="polite">
      <Frame full={full} portrait={portrait && has.video} label="Your stream">
        <video
          ref={preview}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
          onResize={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
          className={`h-full w-full ${facing === "user" ? "-scale-x-100" : ""} ${full && !portrait ? "object-contain" : "object-cover"} ${showVideo ? "" : "hidden"}`}
          aria-label="Your camera preview"
        />
        {phase === "idle" && <Message title="Go live" body="Check your camera and microphone first. Nothing is sent until you press Go live." />}
        {phase === "ended" && <Message title="You've ended the stream" />}
        {(phase === "preview" || phase === "connecting" || phase === "live") && !has.video && (
          <div className="absolute inset-0 grid place-items-center text-center text-white">
            <div className="grid justify-items-center gap-2">
              <span className="scale-[2]"><Eq paused={phase !== "live"} /></span>
              <p className="display display-sm mt-3">Audio only</p>
            </div>
          </div>
        )}
        {!full && chip && <div className="absolute left-3 top-3 z-10">{chip}</div>}
        {!full && (phase === "preview" || phase === "live") && (
          <button type="button" onClick={() => setFull(true)} className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm">
            <Maximize2 aria-hidden="true" size={16} /> Full screen
          </button>
        )}
        {full && (
          <LiveOverlay room={room} artist={artist} title={title} chip={chip} onClose={() => setFull(false)} closeLabel="Minimise" controls={controls} />
        )}
      </Frame>

      {note && <p className="rounded-2xl border border-line bg-white/[0.04] p-3 text-sm text-muted">{note}</p>}
      {error && (
        <div role="alert" className="grid gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost btn-sm w-fit text-ink" onClick={() => void copyLink()}>
            <Copy aria-hidden="true" size={16} /> Copy link to open in your browser
          </button>
        </div>
      )}

      {inNimiqPay && (phase === "idle" || phase === "ended") && !error && (
        <div className="rounded-2xl border border-line bg-white/[0.04] p-3 text-sm text-muted">
          <p>
            <strong className="text-ink">Camera or microphone blocked in Nimiq Pay?</strong> Some phones don't let Nimiq Pay use them. You can go live from your phone's browser instead: open this same page there and sign in with your wallet address. It's the same account and the same show.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyLink()}>
              <Copy aria-hidden="true" size={16} /> Copy link
            </button>
            {canShare && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void shareLink()}>
                Share…
              </button>
            )}
          </div>
        </div>
      )}

      {!full && (
        <div className="flex flex-wrap items-center gap-2">
          {(phase === "idle" || phase === "ended") && (
            <button type="button" className="btn btn-primary" onClick={() => void startPreview()}>
              <Camera aria-hidden="true" size={18} /> {phase === "ended" ? "Start again" : "Start camera & mic"}
            </button>
          )}
          {(phase === "preview" || phase === "connecting" || phase === "live") && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
        </div>
      )}
    </div>
  );
}

export default function LiveVideo({ showId, host, open, room, artist, title }: Common & { host: boolean; open: boolean }) {
  return host ? <Host showId={showId} room={room} artist={artist} title={title} /> : <Viewer showId={showId} open={open} room={room} artist={artist} title={title} />;
}
