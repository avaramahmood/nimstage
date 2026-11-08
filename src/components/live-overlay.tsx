import { Send, X } from "lucide-react";
import { Cover } from "@/components/ui";
import { ReactionIcon, reactionLabel } from "@/components/reaction-icons";
import { REACTIONS, type LiveRoomState } from "@/components/live-room";
import type { ReactNode } from "react";

export type LiveArtist = { name: string; handle: string; avatarKey?: string | null };

/**
 * What sits on top of the video in full screen, like an Instagram Live: who is streaming and how many are
 * watching at the top; the latest chat fading in over the picture at the bottom; a comment box; and a column
 * of reactions that float up the right edge. It only draws; the room's state comes from useLiveRoom.
 */
export function LiveOverlay({
  room,
  artist,
  title,
  chip,
  onClose,
  closeLabel = "Close full screen",
  tip,
  controls,
}: {
  room: LiveRoomState;
  artist: LiveArtist;
  title: string;
  chip: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  tip?: ReactNode;
  controls?: ReactNode;
}) {
  const { msgs, text, setText, totals, here, floaters, setFloaters, popKey, react, send, canPost } = room;
  const recent = msgs.slice(-6);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-white [&_button]:pointer-events-auto [&_form]:pointer-events-auto [&_a]:pointer-events-auto">
      {/* top: who, how many, close */}
      <div className="flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent p-3 pt-[calc(12px+env(safe-area-inset-top))]">
        <Cover seed={`${artist.handle}-avatar`} image={artist.avatarKey} className="h-10 w-10 shrink-0 rounded-full border-2 border-white/80" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{artist.name}</p>
          <p className="truncate text-xs text-white/75">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {chip}
          <span className="rounded-full bg-black/45 px-2.5 py-1 font-mono text-xs" aria-live="polite">{here} watching</span>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="grid h-10 w-10 place-items-center rounded-full bg-black/45">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      {/* bottom: chat, reactions, comment box */}
      <div className="relative w-full self-center bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-16 md:max-w-[680px] md:rounded-t-[28px]">
        <div aria-hidden="true" className="pointer-events-none absolute bottom-16 right-2 h-72 w-24 overflow-hidden">
          {floaters.map((f) => (
            <span key={f.id} className="floater" style={{ ["--x" as string]: `${f.x}%`, ["--dx" as string]: `${f.dx}px` }} onAnimationEnd={() => setFloaters((all) => all.filter((x) => x.id !== f.id))}>
              <ReactionIcon name={f.emoji} size={30} />
            </span>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <ul role="log" aria-live="polite" aria-label="Chat messages" className="grid min-w-0 flex-1 gap-1.5 [mask-image:linear-gradient(to_bottom,transparent,black_35%)]">
            {recent.map((m) => (
              <li key={m.id} className="w-fit max-w-full rounded-2xl bg-black/35 px-3 py-1.5 text-sm leading-snug">
                <span className="font-semibold">{m.name}</span> <span className="break-words text-white/90">{m.body}</span>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 flex-col gap-2" role="group" aria-label="React to the stream">
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => react(e)}
                aria-label={`React: ${reactionLabel(e)}, ${totals[e] ?? 0} so far`}
                className="grid h-12 w-12 place-items-center rounded-full bg-black/45 backdrop-blur-sm active:scale-90"
              >
                <span key={popKey[e] ?? 0} className={popKey[e] ? "pop" : ""}><ReactionIcon name={e} size={24} /></span>
              </button>
            ))}
          </div>
        </div>

        {controls && <div className="mt-3 flex flex-wrap items-center justify-center gap-3">{controls}</div>}
        <div className="mt-3 flex items-center gap-2">
          {canPost ? (
            <form onSubmit={send} className="flex min-w-0 flex-1 items-center gap-2">
              <label className="sr-only" htmlFor="live-chat-input">Add a comment</label>
              <input
                id="live-chat-input"
                className="min-h-12 min-w-0 flex-1 rounded-full border border-white/40 bg-black/40 px-4 text-white placeholder:text-white/70"
                placeholder="Add a comment…"
                maxLength={280}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" aria-label="Send comment" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                <Send aria-hidden="true" size={18} />
              </button>
            </form>
          ) : (
            <p className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-3 text-sm text-white/85">Get a ticket to comment. Reactions are open to everyone.</p>
          )}
          {tip}
        </div>
      </div>
    </div>
  );
}
