import { useRouter } from "@/lib/nav";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ACCENTS, ACCENT_KEYS, MAX_LINKS, type ArtistLink } from "@shared/artist";
import { dayOptions, joinLocalValue, nextSlot, splitLocalValue, toLocalValue } from "@shared/when";

function useSubmit() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, message: string, to: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(message, "ok");
      router.push(to);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

function FormShell({ onSubmit, error, busy, cta, children }: { onSubmit: (e: FormEvent) => void; error: string | null; busy: boolean; cta: string; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {children}
      {error && <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">{error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : cta}</button>
    </form>
  );
}

export function ProfileForm({ initial }: { initial?: { handle: string; name: string; bio: string; genre: string; payoutAddress: string; tagline?: string; accent?: string; links?: ArtistLink[] } }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ handle: initial?.handle ?? "", name: initial?.name ?? "", bio: initial?.bio ?? "", genre: initial?.genre ?? "", tagline: initial?.tagline ?? "", accent: initial?.accent ?? "", links: initial?.links ?? ([] as ArtistLink[]), payoutAddress: initial?.payoutAddress ?? "", ownsRights: !!initial });
  const set = (k: "handle" | "name" | "bio" | "genre" | "tagline" | "payoutAddress") => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setLink = (i: number, patch: Partial<ArtistLink>) => setF((x) => ({ ...x, links: x.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  return (
    <FormShell
      busy={busy}
      error={error}
      cta={initial ? "Save profile" : "Create artist profile"}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api("/api/studio/profile", { ...f, handle: initial ? undefined : f.handle.toLowerCase(), ownsRights: f.ownsRights || undefined }), "Profile saved.", "/studio");
      }}
    >
      {!initial && <Field label="Handle" hint="Your link: /artist/handle. Letters, numbers and _ only."><input className="field" required minLength={3} maxLength={24} value={f.handle} onChange={set("handle")} autoCapitalize="none" /></Field>}
      <Field label="Artist or band name"><input className="field" required minLength={2} maxLength={60} value={f.name} onChange={set("name")} /></Field>
      <Field label="Genre"><input className="field" required minLength={2} maxLength={30} value={f.genre} onChange={set("genre")} placeholder="Dream pop, Afrobeat, Folk…" /></Field>
      <Field label="Tagline" hint="One line under your name. Optional."><input className="field" maxLength={80} value={f.tagline} onChange={set("tagline")} placeholder="Songs from a fourth-floor window" /></Field>
      <Field label="Bio"><textarea className="field" rows={4} maxLength={600} value={f.bio} onChange={set("bio")} /></Field>
      <fieldset>
        <legend className="label">Accent colour</legend>
        <p className="mt-1 text-sm text-muted">A glow around your page. Optional.</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
          {[["", "Default"] as const, ...ACCENT_KEYS.map((k) => [k, k[0].toUpperCase() + k.slice(1)] as const)].map(([key, name]) => (
            <button
              key={key || "default"}
              type="button"
              role="radio"
              aria-checked={f.accent === key}
              aria-label={name}
              onClick={() => setF((x) => ({ ...x, accent: key }))}
              className={`grid h-11 w-11 place-items-center rounded-full border-2 ${f.accent === key ? "border-ink" : "border-line"}`}
            >
              <span className="h-6 w-6 rounded-full border border-white/20" style={{ background: key ? ACCENTS[key as keyof typeof ACCENTS] : "transparent" }} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Links</legend>
        <p className="mt-1 text-sm text-muted">Up to {MAX_LINKS}. Full https:// addresses only.</p>
        <div className="mt-2 grid gap-3">
          {f.links.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <div className="grid gap-2">
                <input className="field" aria-label={`Link ${i + 1} label`} placeholder="Label, e.g. Bandcamp" maxLength={24} value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} />
                <input className="field" aria-label={`Link ${i + 1} address`} placeholder="https://" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={200} value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
              </div>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove link ${i + 1}`} onClick={() => setF((x) => ({ ...x, links: x.links.filter((_, j) => j !== i) }))}>
                Remove
              </button>
            </div>
          ))}
          {f.links.length < MAX_LINKS && (
            <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => setF((x) => ({ ...x, links: [...x.links, { label: "", url: "https://" }] }))}>
              Add a link
            </button>
          )}
        </div>
      </fieldset>
      <Field label="Payout address" hint="Fans pay this Nimiq address directly. Double-check it: payments can't be reversed."><input className="field font-mono" required value={f.payoutAddress} onChange={set("payoutAddress")} placeholder="NQ.." autoCapitalize="characters" spellCheck={false} /></Field>
      <label className="flex gap-3 rounded-2xl border border-line p-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#fa5d29]" checked={f.ownsRights} onChange={(e) => setF((x) => ({ ...x, ownsRights: e.target.checked }))} />
        <span>I own the music I upload, or have permission to sell it, and I&apos;ve read the content policy.</span>
      </label>
    </FormShell>
  );
}

export function TrackForm() {
  const { busy, error, run } = useSubmit();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("0");
  const [preview, setPreview] = useState("30");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [rights, setRights] = useState(false);

  function pick(f: File | null) {
    setFile(f);
    setDuration(0);
    if (!f) return;
    const url = URL.createObjectURL(f);
    const a = new Audio(url);
    a.addEventListener("loadedmetadata", () => {
      setDuration(Math.round(a.duration) || 0);
      URL.revokeObjectURL(url);
    });
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  return (
    <FormShell
      busy={busy}
      error={error}
      cta="Upload track"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("title", title);
        fd.set("priceNim", price || "0");
        fd.set("previewSec", preview);
        fd.set("durationSec", String(duration || 60));
        fd.set("ownsRights", rights ? "true" : "false");
        if (file) fd.set("file", file);
        void run(() => api("/api/studio/tracks", fd), "Track uploaded.", "/studio");
      }}
    >
      <Field label="Audio file" hint="MP3, WAV, OGG, M4A or AAC, up to 40 MB.">
        <input className="field" type="file" required accept="audio/*" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </Field>
      {file && <p className="font-mono text-xs text-muted">{file.name} · {duration ? `${duration}s` : "reading length…"}</p>}
      <Field label="Title"><input className="field" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (NIM)" hint="0 = free, 5 NIM at most"><input className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
        <Field label="Free preview (s)" hint="10–60"><input className="field" inputMode="numeric" value={preview} onChange={(e) => setPreview(e.target.value.replace(/\D/g, ""))} /></Field>
      </div>
      <label className="flex gap-3 rounded-2xl border border-line p-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#fa5d29]" checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <span>I own this music or have permission to sell it.</span>
      </label>
    </FormShell>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const two = (n: number) => String(n).padStart(2, "0");

/** Day / hour / minute dropdowns. No native date-time picker: those can freeze embedded WebViews. */
function WhenPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = splitLocalValue(value) ?? splitLocalValue(toLocalValue(nextSlot()))!;
  const days = useMemo(() => dayOptions(), []);
  const options = days.some((d) => d.value === parts.date) ? days : [{ value: parts.date, label: parts.date }, ...days];
  const set = (patch: Partial<typeof parts>) => onChange(joinLocalValue({ ...parts, ...patch }));
  return (
    <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2">
      <select className="field" aria-label="Day" value={parts.date} onChange={(e) => set({ date: e.target.value })}>
        {options.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <select className="field" aria-label="Hour" value={parts.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
        {HOURS.map((h) => <option key={h} value={h}>{two(h)}</option>)}
      </select>
      <select className="field" aria-label="Minute" value={parts.minute} onChange={(e) => set({ minute: Number(e.target.value) })}>
        {[...new Set([...MINUTES, parts.minute])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{two(m)}</option>)}
      </select>
    </div>
  );
}

export function ShowForm({ tracks }: { tracks: { id: string; title: string }[] }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ title: "", description: "", startsAt: toLocalValue(nextSlot()), durationMin: "45", priceNim: "2", kind: tracks.length ? "premiere" : "live", trackId: tracks[0]?.id ?? "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <FormShell
      busy={busy}
      error={error}
      cta="Schedule show"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => api("/api/studio/shows", { title: f.title, description: f.description, startsAt: new Date(f.startsAt).toISOString(), durationMin: Number(f.durationMin), priceNim: Number(f.priceNim), kind: f.kind, trackId: f.kind === "premiere" ? f.trackId : undefined }),
          "Show scheduled.",
          "/studio",
        );
      }}
    >
      <Field label="Type" hint={f.kind === "live" ? "Real live video from your camera. Ticket holders and supporters watch." : "Plays one of your uploaded tracks at the start time."}>
        <select className="field" value={f.kind} onChange={set("kind")}>
          <option value="premiere" disabled={!tracks.length}>{tracks.length ? "Audio premiere (pre-recorded)" : "Audio premiere (upload a track first)"}</option>
          <option value="live">Live video</option>
        </select>
      </Field>
      <Field label="Title"><input className="field" required maxLength={80} value={f.title} onChange={set("title")} /></Field>
      <Field label="Description"><textarea className="field" rows={3} maxLength={600} value={f.description} onChange={set("description")} /></Field>
      <fieldset>
        <legend className="label">Starts at</legend>
        <WhenPicker value={f.startsAt} onChange={(v) => setF((x) => ({ ...x, startsAt: v }))} />
        <span className="mt-1 block text-sm text-muted">Your local time.</span>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Length (min)"><input className="field" inputMode="numeric" required value={f.durationMin} onChange={(e) => setF((x) => ({ ...x, durationMin: e.target.value.replace(/\D/g, "") }))} /></Field>
        <Field label="Ticket (NIM)" hint="0 = free, 5 NIM at most"><input className="field" inputMode="decimal" value={f.priceNim} onChange={(e) => setF((x) => ({ ...x, priceNim: e.target.value.replace(/[^0-9.]/g, "") }))} /></Field>
      </div>
      {f.kind === "premiere" && (
        <Field label="Show audio" hint="The premiere plays this track. Upload one first if the list is empty.">
          <select className="field" required value={f.trackId} onChange={set("trackId")}>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
      )}
    </FormShell>
  );
}

export function PostForm({ tiers }: { tiers: { id: string; name: string }[] }) {
  const { busy, error, run } = useSubmit();
  const [body, setBody] = useState("");
  const [tierId, setTierId] = useState("");
  return (
    <FormShell busy={busy} error={error} cta="Publish post" onSubmit={(e) => { e.preventDefault(); void run(() => api("/api/studio/posts", { body, tierId: tierId || null }), "Post published.", "/studio"); }}>
      <Field label="Post"><textarea className="field" rows={6} required maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <Field label="Who can read it" hint="Supporter-only posts are never sent to non-supporters.">
        <select className="field" value={tierId} onChange={(e) => setTierId(e.target.value)}>
          <option value="">Everyone</option>
          {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} supporters and above</option>)}
        </select>
      </Field>
    </FormShell>
  );
}

export function TierForm() {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ name: "", perks: "", priceNim: "2" });
  return (
    <FormShell busy={busy} error={error} cta="Add tier" onSubmit={(e) => { e.preventDefault(); void run(() => api("/api/studio/tiers", { name: f.name, perks: f.perks, priceNim: Number(f.priceNim) }), "Tier added.", "/studio"); }}>
      <Field label="Tier name"><input className="field" required minLength={2} maxLength={30} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="Front Row" /></Field>
      <Field label="What supporters get"><textarea className="field" rows={3} maxLength={200} value={f.perks} onChange={(e) => setF((x) => ({ ...x, perks: e.target.value }))} /></Field>
      <Field label="Price per 30 days (NIM)" hint="0.5 to 5 NIM"><input className="field" inputMode="decimal" required value={f.priceNim} onChange={(e) => setF((x) => ({ ...x, priceNim: e.target.value.replace(/[^0-9.]/g, "") }))} /></Field>
    </FormShell>
  );
}

/** Two-tap remove (no browser confirm() dialog, which can block a WebView). */
export function PollForm({ tiers }: { tiers: { id: string; name: string }[] }) {
  const { busy, error, run } = useSubmit();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [tierId, setTierId] = useState("");
  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  return (
    <FormShell
      busy={busy}
      error={error}
      cta="Start poll"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api("/api/studio/polls", { question, options: options.map((o) => o.trim()).filter(Boolean), tierId: tierId || null }), "Poll is live.", "/studio");
      }}
    >
      <Field label="Question" hint="e.g. Which song should open the next show?">
        <input className="field" required minLength={5} maxLength={140} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="label mb-1">Options (2 to 5)</legend>
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <label className="sr-only" htmlFor={`opt-${i}`}>Option {i + 1}</label>
            <input id={`opt-${i}`} className="field min-w-0 flex-1" maxLength={60} value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} />
            {options.length > 2 && (
              <button type="button" aria-label={`Remove option ${i + 1}`} className="btn btn-ghost btn-sm" onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < 5 && (
          <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => setOptions((o) => [...o, ""])}>
            + Add option
          </button>
        )}
      </fieldset>
      <Field label="Who can vote" hint="Tier-gated polls make your supporter perk real.">
        <select className="field" value={tierId} onChange={(e) => setTierId(e.target.value)}>
          <option value="">Any signed-in fan</option>
          {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} supporters and above</option>)}
        </select>
      </Field>
    </FormShell>
  );
}

export function ClosePollButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Close poll ${label}`}
      className="min-h-10 px-2 text-sm text-muted underline underline-offset-4"
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/studio/polls", { id }, "PATCH");
          toast("Poll closed. Results stay visible.", "ok");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      Close
    </button>
  );
}

export function RemoveButton({ kind, id, label }: { kind: "track" | "show" | "post" | "tier" | "poll"; id: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={armed ? `Confirm removing ${label}` : `Remove ${label}`}
      className={`min-h-10 px-2 text-sm underline underline-offset-4 ${armed ? "bg-danger font-medium text-accent-ink no-underline" : "text-danger"}`}
      onBlur={() => setArmed(false)}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          if (kind === "tier") await api("/api/studio/tiers", { id }, "DELETE");
          else await api("/api/studio/remove", { kind, id });
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {armed ? "Tap again" : "Remove"}
    </button>
  );
}
