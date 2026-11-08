import { useEffect, useRef, useState, type ReactNode } from "react";
import { Room, RoomEvent, Track, createLocalTracks, type LocalTrack, type RemoteTrack } from "livekit-client";
import { Camera, CameraOff, Mic, MicOff, Radio, Square, Volume2 } from "lucide-react";
import { api } from "@/lib/api";

/*
  Live video, via LiveKit. The server decides who may join and whether they can publish (the artist) or
  only watch (everyone with access); this file just connects with the token it is given.
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

/* ------------------------------- viewer ------------------------------- */

function Viewer({ showId, open }: { showId: string; open: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [error, setError] = useState("");
  const [needAudio, setNeedAudio] = useState(false);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const audioEls = audioBox.current;

    const attach = (t: RemoteTrack) => {
      if (t.kind === Track.Kind.Video && video.current) {
        t.attach(video.current);
        setPhase("live");
      } else if (t.kind === Track.Kind.Audio) audioEls?.appendChild(t.attach());
    };
    room
      .on(RoomEvent.TrackSubscribed, attach)
      .on(RoomEvent.TrackUnsubscribed, (t) => {
        t.detach();
        if (t.kind === Track.Kind.Video) setPhase("waiting");
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
  return (
    <div className="grid gap-3" aria-live="polite">
      <Stage chip={phase === "live" ? <Chip live>Live</Chip> : undefined}>
        <video ref={video} autoPlay playsInline muted className={`h-full w-full object-contain ${phase === "live" ? "" : "hidden"}`} aria-label="Live video" />
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
  const preview = useRef<HTMLVideoElement>(null);
  const tracks = useRef<LocalTrack[]>([]);
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<"idle" | "preview" | "connecting" | "live" | "ended">("idle");
  const [error, setError] = useState("");
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

  async function startPreview() {
    setError("");
    try {
      const local = await createLocalTracks({ audio: true, video: { facingMode: "user" } });
      tracks.current = local;
      const v = local.find((t) => t.kind === Track.Kind.Video);
      if (v && preview.current) v.attach(preview.current);
      setMic(true);
      setCam(true);
      setPhase("preview");
    } catch (e) {
      const denied = (e as Error)?.name === "NotAllowedError" || (e as Error)?.name === "NotFoundError";
      setError(denied ? "Allow camera and microphone access to stream. If this app won't ask for it, open this page in your phone's browser to go live." : errText(e));
    }
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

  return (
    <div className="grid gap-3" aria-live="polite">
      <Stage chip={phase === "live" ? <Chip live>You're live</Chip> : phase === "preview" ? <Chip>Preview</Chip> : undefined}>
        <video ref={preview} autoPlay playsInline muted className={`h-full w-full -scale-x-100 object-cover ${phase === "idle" || phase === "ended" ? "hidden" : ""}`} aria-label="Your camera preview" />
        {phase === "idle" && <Message title="Go live with your camera" body="Check your camera and microphone first. Nothing is sent until you press Go live." />}
        {phase === "ended" && <Message title="You've ended the stream" />}
      </Stage>

      {error && (
        <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(phase === "idle" || phase === "ended") && (
          <button type="button" className="btn btn-primary" onClick={() => void startPreview()}>
            <Camera aria-hidden="true" size={18} /> {phase === "ended" ? "Start again" : "Start camera"}
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
        {(phase === "preview" || phase === "live") && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={!mic} aria-label={mic ? "Mute microphone" : "Unmute microphone"} onClick={() => toggle(Track.Kind.Audio, mic, setMic)}>
              {mic ? <Mic aria-hidden="true" size={18} /> : <MicOff aria-hidden="true" size={18} />}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={!cam} aria-label={cam ? "Turn camera off" : "Turn camera on"} onClick={() => toggle(Track.Kind.Video, cam, setCam)}>
              {cam ? <Camera aria-hidden="true" size={18} /> : <CameraOff aria-hidden="true" size={18} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LiveVideo({ showId, host, open }: { showId: string; host: boolean; open: boolean }) {
  return host ? <Host showId={showId} /> : <Viewer showId={showId} open={open} />;
}
