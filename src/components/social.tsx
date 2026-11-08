import { useState } from "react";
import { Flag, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { Sheet } from "@/components/sheet";
import { SignInPanel } from "@/components/auth";
import { haptic } from "@/lib/fun";

export function FollowButton({ artistId, initial }: { artistId: string; initial: boolean }) {
  const { me } = useWallet();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!me?.user) return toast("Sign in to follow artists.");
    setBusy(true);
    try {
      const { following } = await api<{ following: boolean }>("/api/follow", { artistId });
      setOn(following);
      if (following) haptic(10);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" aria-pressed={on} onClick={toggle} disabled={busy} className={`btn btn-sm ${on ? "btn-blue" : "btn-ghost"}`}>
      <Heart aria-hidden="true" size={16} fill={on ? "currentColor" : "none"} className={on ? "pop" : ""} />
      {on ? "Following" : "Follow"}
    </button>
  );
}

const REASONS = [
  ["copyright", "I own this music (copyright)"],
  ["explicit", "Explicit or adult content"],
  ["scam", "Scam or misleading"],
  ["spam", "Spam"],
  ["other", "Something else"],
] as const;

export function ReportButton({ targetKind, targetId }: { targetKind: "track" | "show" | "artist" | "post"; targetId: string }) {
  const { me } = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("copyright");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await api("/api/reports", { targetKind, targetId, reason, note: note || undefined });
      toast("Report sent. Thank you.", "ok");
      setOpen(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 text-sm text-muted underline underline-offset-4">
        <Flag aria-hidden="true" size={14} /> Report
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Report this" label="Takedowns reviewed by admins">
        {!me?.user ? (
          <SignInPanel compact />
        ) : (
          <div className="grid gap-3">
            <fieldset className="grid gap-2">
              <legend className="label mb-1">Reason</legend>
              {REASONS.map(([v, text]) => (
                <label key={v} className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 ${reason === v ? "border-ink bg-white/[0.06]" : "border-line"}`}>
                  <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="accent-[#fa5d29]" />
                  {text}
                </label>
              ))}
            </fieldset>
            <label>
              <span className="label">Details (optional)</span>
              <textarea className="field mt-1" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={send}>
              Send report
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
