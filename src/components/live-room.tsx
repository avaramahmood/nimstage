import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/components/link";
import { Send } from "lucide-react";
import { api, randomHex } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { haptic } from "@/lib/fun";

const EMOJI = ["🔥", "❤️", "👏", "🎸"] as const;
const MAX_FLOATERS = 18;

type Msg = { id: string; body: string; name: string; username?: string | null; userId: string; createdAt: string };
type Poll = { messages: Msg[]; reactions: Record<string, number>; here: number };
type Floater = { id: number; emoji: string; x: number; dx: number };

/**
 * The live room: reactions that float up, who's here, and chat. One poll feeds all of it
 * (chat + reaction totals + presence), it pauses while the tab is hidden, and the floating
 * emoji animate transform/opacity only, capped so a burst of taps can't pile up DOM.
 */
export function LiveRoom({ showId, canPost, live }: { showId: string; canPost: boolean; live: boolean }) {
  const { me } = useWallet();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [here, setHere] = useState(0);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [popKey, setPopKey] = useState<Record<string, number>>({});
  const last = useRef<string | undefined>(undefined);
  const known = useRef<Record<string, number> | null>(null);
  const pending = useRef<Record<string, number>>({});
  const nextId = useRef(0);
  const box = useRef<HTMLUListElement>(null);
  const [cid] = useState(() => randomHex(8)); // per-tab presence id (not tied to a user)

  const spawn = useCallback((emoji: string, n = 1) => {
    setFloaters((f) => {
      const add: Floater[] = Array.from({ length: n }, () => ({ id: nextId.current++, emoji, x: 8 + Math.random() * 80, dx: (Math.random() - 0.5) * 70 }));
      return [...f, ...add].slice(-MAX_FLOATERS);
    });
  }, []);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const q = new URLSearchParams({ cid });
      if (last.current) q.set("after", last.current);
      const r = await api<Poll>(`/api/shows/${showId}/chat?${q}`);
      setHere(r.here);
      if (r.messages.length) {
        last.current = r.messages[r.messages.length - 1].createdAt;
        setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))].slice(-100));
      }
      // Other people's reactions: float a few, so the room feels alive without flooding the screen.
      if (known.current) {
        for (const e of EMOJI) {
          const delta = (r.reactions[e] ?? 0) - (known.current[e] ?? 0) - (pending.current[e] ?? 0);
          if (delta > 0) spawn(e, Math.min(delta, 4));
        }
      }
      known.current = r.reactions;
      // Totals only ever go up, so never show less than we already showed (avoids a brief dip
      // between a batch being sent and the server counting it).
      setTotals((t) => {
        const next: Record<string, number> = {};
        for (const e of EMOJI) next[e] = Math.max(t[e] ?? 0, (r.reactions[e] ?? 0) + (pending.current[e] ?? 0));
        return next;
      });
    } catch {
      /* transient network error: try again next tick */
    }
  }, [showId, cid, spawn]);

  useEffect(() => {
    const first = setTimeout(poll, 0); // first poll on the next tick
    const id = setInterval(poll, live ? 3000 : 8000);
    const onVis = () => !document.hidden && void poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll, live]);

  useEffect(() => {
    // scrollTop works in every WebView; Element.scrollTo isn't available everywhere
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs.length]);

  // Taps are batched: instant local feedback, one request every ~700 ms.
  useEffect(() => {
    const id = setInterval(async () => {
      const batch = pending.current;
      const entries = Object.entries(batch).filter(([, n]) => n > 0);
      if (!entries.length) return;
      pending.current = {};
      for (const [emoji, n] of entries) {
        try {
          await api(`/api/shows/${showId}/reactions`, { emoji, n });
        } catch {
          /* rate limited or offline: the visual feedback already happened, drop the batch */
        }
      }
    }, 700);
    return () => clearInterval(id);
  }, [showId]);

  function react(emoji: string) {
    pending.current[emoji] = (pending.current[emoji] ?? 0) + 1;
    setTotals((t) => ({ ...t, [emoji]: (t[emoji] ?? 0) + 1 }));
    setPopKey((k) => ({ ...k, [emoji]: (k[emoji] ?? 0) + 1 }));
    spawn(emoji);
    haptic(8);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      await api(`/api/shows/${showId}/chat`, { body });
      void poll(); // show my own message right away
    } catch (err) {
      setText(body);
      toast((err as Error).message, "error");
    }
  }

  return (
    <section aria-label="Live room" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="label">Live room</h2>
        <p className="flex items-center gap-2 font-mono text-xs uppercase text-muted" aria-live="polite">
          {live && <span className="live-dot text-accent" aria-hidden="true" />}
          {here} here now
        </p>
      </div>

      {/* Reactions */}
      <div className="relative border-b border-line px-3 pb-3 pt-2">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-60 overflow-hidden">
          {floaters.map((f) => (
            <span key={f.id} className="floater" style={{ ["--x" as string]: `${f.x}%`, ["--dx" as string]: `${f.dx}px` }} onAnimationEnd={() => setFloaters((all) => all.filter((x) => x.id !== f.id))}>
              {f.emoji}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="React to the show">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              aria-label={`React ${e}, ${totals[e] ?? 0} so far`}
              className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-line bg-white/[0.04] transition-colors hover:bg-white/[0.1] active:bg-white/[0.16]"
            >
              <span key={popKey[e] ?? 0} className={`text-2xl leading-none ${popKey[e] ? "pop" : ""}`}>{e}</span>
              <span className="mt-1 font-mono text-xs text-muted">{totals[e] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <ul ref={box} role="log" aria-live="polite" aria-label="Chat messages" className="h-64 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && <li className="text-muted">No messages yet. Say hi.</li>}
        {msgs.map((m) => (
          <li key={m.id} className="py-1">
            <span className={`font-medium ${m.userId === me?.user?.id ? "text-accent" : "text-blue"}`}>
              {m.username ? <Link href={`/u/${m.username}`} className="hover:underline">{m.name}</Link> : m.name}
            </span>
            {m.username && <span className="text-xs text-muted"> @{m.username}</span>} <span className="break-words">{m.body}</span>
          </li>
        ))}
      </ul>
      {canPost ? (
        <form onSubmit={send} className="flex items-center gap-2 border-t border-line p-2">
          <label className="sr-only" htmlFor="chat-input">Message</label>
          <input id="chat-input" className="field min-w-0 flex-1 rounded-full" placeholder="Say something…" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" aria-label="Send message" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            <Send aria-hidden="true" size={18} />
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">Get a ticket to join the chat. Reactions are open to everyone.</p>
      )}
    </section>
  );
}
