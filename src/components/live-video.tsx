import { useEffect, useRef, useState, type ReactNode } from "react";
import { Room, RoomEvent, Track, createLocalTracks, type LocalTrack, type RemoteTrack } from "livekit-client";
import { Camera, CameraOff, Copy, Mic, MicOff, Radio, Square, Volume2 } from "lucide-react";
import { Eq } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/api";

/*
  Live video, via LiveKit. The server decides who may join and whether they can publish (the artist) or
  only watch (everyone with access); this file just connects with the token it is given.
  A stream can be video + audio, audio only (a music show needs no picture) or video only.
  Loaded lazily from the show page, so the SDK never weighs on pages without video.
*/

type Join = { token: string; url: string; role: "host" | "viewer" };

function Stage({ children, chip }: { children: ReactNode; chip?: ReactNode }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[20px] bg-black">
      {children}
      {chip && <div className="absolute left-3 top-3 z-10">{chip}</div>}
    </div>
  );
}

const Chip = ({ live, children }: { live?: boolean; children: ReactNode }) => (
  <span className={`sticker ${live ? "" : "sticker-cream"}`}>{children}</span>
);

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      <div>
        <p className="display display-sm">{title}</p>
        {body && <p className="mt-2 text-muted">{body}</p>}
      </div>
    </div>
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** What the browser's media errors actually mean, in words an artist can act on. */
function explainMediaError(e: unknown): string {
  const name = (e as Error)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "This app isn't allowed to use your camera or microphone. Allow it in your phone's Settings → Apps → Nimiq Pay → Permissions, then try again.";
  if (name === "NotReadableError" || /could not start|audio source|video source/i.test((e as Error)?.message ?? ""))
    return "Your phone wouldn't start the microphone or camera. Another app may be using it, or this app doesn't have permission (Settings → Apps → Nimiq Pay → Permissions).";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found on this device.";
  return errText(e);
}

/* ------------------------------- viewer ------------------------------- */

function Viewer({ showId, open }: { showId: string; open: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [media, setMedia] = useState({ video: false, audio: false });
  const [error, setError] = useState("");
  const [needAudio, setNeedAudio] = useState(false);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
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
    room
      .on(RoomEvent.TrackSubscribed, attach)
      .on(RoomEvent.TrackUnsubscribed, (t) => {
        t.detach();
        if (t.kind === Track.Kind.Video) have.video = Math.max(0, have.video - 1);
        else if (t.kind === Track.Kind.Audio) have.audio = Math.max(0, have.audio - 1);
        sync();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedAudio(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, () => !dead && setPhase("ended"));

    void (async () => {
      try {
        const j = await api<Join>(`/api/shows/${showId}/live/token`, {});
        if (dead) return;
        await room.connect(j.url, j.token);
        if (dead) return room.disconnect();
        setPhase((p) => (p === "live" ? p : "waiting"));
      } catch (e) {
        if (dead) return;
        setError(errText(e));
        setPhase("error");
      }
    })();

    return () => {
      dead = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [showId, open]);

  if (!open) {
    return (
      <Stage>
        <Message title="The video room opens shortly before the show" body="Come back at the start time." />
      </Stage>
    );
  }
  const audioOnly = phase === "live" && media.audio && !media.video;
  return (
    <div className="grid gap-3" aria-live="polite">
      <Stage chip={phase === "live" ? <Chip live>{audioOnly ? "Live · audio" : "Live"}</Chip> : undefined}>
        <video ref={video} autoPlay playsInline muted className={`h-full w-full object-contain ${phase === "live" && media.video ? "" : "hidden"}`} aria-label="Live video" />
        {audioOnly && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div className="grid justify-items-center gap-3">
              <span className="scale-[2.2]"><Eq /></span>
              <p className="display display-sm mt-4">Audio only</p>
              <p className="text-muted">The artist is playing live without video.</p>
            </div>
          </div>
        )}
        {phase === "connecting" && <Message title="Connecting…" />}
        {phase === "waiting" && <Message title="Waiting for the artist" body="The stream starts when they go live. You can stay on this page." />}
        {phase === "ended" && <Message title="The stream has ended" body="Thanks for watching." />}
        {phase === "error" && <Message title="Couldn't join the stream" body={error} />}
      </Stage>
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

function Host({ showId }: { showId: string }) {
  const toast = useToast();
  const preview = useRef<HTMLVideoElement>(null);
  const tracks = useRef<LocalTrack[]>([]);
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<"idle" | "preview" | "connecting" | "live" | "ended">("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [has, setHas] = useState({ audio: false, video: false });
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);

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
    const tries: { label: string; opts: { audio: boolean; video: false | { facingMode: "user" } }; note: string }[] = [
      { label: "both", opts: { audio: true, video: { facingMode: "user" } }, note: "" },
      { label: "audio", opts: { audio: true, video: false }, note: "Your camera isn't available, so you'll stream audio only. That works fine for music: viewers hear you but don't see you." },
      { label: "video", opts: { audio: false, video: { facingMode: "user" } }, note: "Your microphone isn't available, so viewers will see you but not hear you. Fix the microphone permission before you go live." },
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
      const room = new Room();
      roomRef.current = room;
      room.on(RoomEvent.Disconnected, () => setPhase((p) => (p === "live" ? "ended" : p)));
      await room.connect(j.url, j.token);
      for (const t of tracks.current) await room.localParticipant.publishTrack(t);
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied. Paste it into your phone's browser.", "ok");
    } catch {
      toast("Couldn't copy. Open this page in your phone's browser instead.", "error");
    }
  }

  const showVideo = (phase === "preview" || phase === "connecting" || phase === "live") && has.video;
  return (
    <div className="grid gap-3" aria-live="polite">
      <Stage chip={phase === "live" ? <Chip live>You're live{!has.video ? " · audio" : ""}</Chip> : phase === "preview" ? <Chip>Preview</Chip> : undefined}>
        <video ref={preview} autoPlay playsInline muted className={`h-full w-full -scale-x-100 object-cover ${showVideo ? "" : "hidden"}`} aria-label="Your camera preview" />
        {phase === "idle" && <Message title="Go live" body="Check your camera and microphone first. Nothing is sent until you press Go live." />}
        {phase === "ended" && <Message title="You've ended the stream" />}
        {(phase === "preview" || phase === "connecting" || phase === "live") && !has.video && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div className="grid justify-items-center gap-2">
              <span className="scale-[2]"><Eq paused={phase !== "live"} /></span>
              <p className="display display-sm mt-3">Audio only</p>
            </div>
          </div>
        )}
      </Stage>

      {note && <p className="rounded-2xl border border-line bg-white/[0.04] p-3 text-sm text-muted">{note}</p>}
      {error && (
        <div role="alert" className="grid gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost btn-sm w-fit text-ink" onClick={() => void copyLink()}>
            <Copy aria-hidden="true" size={16} /> Copy link to open in your browser
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(phase === "idle" || phase === "ended") && (
          <button type="button" className="btn btn-primary" onClick={() => void startPreview()}>
            <Camera aria-hidden="true" size={18} /> {phase === "ended" ? "Start again" : "Start camera & mic"}
          </button>
        )}
        {(phase === "preview" || phase === "connecting") && (
          <button type="button" className="btn btn-primary" disabled={phase === "connecting"} onClick={() => void goLive()}>
            <Radio aria-hidden="true" size={18} /> {phase === "connecting" ? "Going live…" : "Go live"}
          </button>
        )}
        {phase === "live" && (
          <button type="button" className="btn btn-ghost" onClick={() => void end()}>
            <Square aria-hidden="true" size={16} /> End stream
          </button>
        )}
        {(phase === "preview" || phase === "live") && has.audio && (
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={!mic} aria-label={mic ? "Mute microphone" : "Unmute microphone"} onClick={() => toggle(Track.Kind.Audio, mic, setMic)}>
            {mic ? <Mic aria-hidden="true" size={18} /> : <MicOff aria-hidden="true" size={18} />}
          </button>
        )}
        {(phase === "preview" || phase === "live") && has.video && (
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={!cam} aria-label={cam ? "Turn camera off" : "Turn camera on"} onClick={() => toggle(Track.Kind.Video, cam, setCam)}>
            {cam ? <Camera aria-hidden="true" size={18} /> : <CameraOff aria-hidden="true" size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LiveVideo({ showId, host, open }: { showId: string; host: boolean; open: boolean }) {
  return host ? <Host showId={showId} /> : <Viewer showId={showId} open={open} />;
}
