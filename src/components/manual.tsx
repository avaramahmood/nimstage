import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { looksLikeNimiqAddress, lunaToNim } from "@shared/units";

/*
  NimStage outside Nimiq Pay (a normal browser). Nothing here needs a wallet extension:
  - signing in = paste your address, then send one luna from it with a code in the message (the sender of a
    transaction is fixed by its signature, so the server sees on mainnet that you hold the address);
  - paying = send the shown amount to the artist with the shown message, from any Nimiq wallet.
  The server finds both transactions by their message, so the page just waits and asks.
*/

const nimText = (luna: number) => lunaToNim(luna).toFixed(5).replace(/\.?0+$/, "") || "0";

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // clipboard blocked (insecure context / WebView): select the text so a manual copy works
      const el = document.getElementById(`cf-${label}`);
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      toast("Press and hold the text to copy it.", "error");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="rounded-2xl border border-line bg-white/[0.04] p-3">
      <p className="label">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p id={`cf-${label}`} className={`min-w-0 flex-1 break-all select-all ${mono ? "font-mono text-sm" : ""}`}>{value}</p>
        <button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`} className="btn btn-ghost btn-sm shrink-0">
          {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const WalletLink = () => (
  <a href="https://wallet.nimiq.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4">
    Open the Nimiq Wallet <ExternalLink aria-hidden="true" size={14} />
  </a>
);

/** Polls `check` every few seconds until it says done, an error stops it, or `minutes` pass. */
function usePoll(check: () => Promise<boolean>, minutes: number, active: boolean) {
  const run = useRef(check);
  useEffect(() => {
    run.current = check; // always poll with the latest callback, without restarting the timer
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let busy = false;
    const t0 = Date.now();
    const tick = async () => {
      if (stop || busy || document.hidden) return;
      busy = true;
      try {
        if (await run.current()) stop = true;
      } catch {
        /* a hiccup: try again next tick */
      } finally {
        busy = false;
      }
      if (!stop && Date.now() - t0 > minutes * 60_000) {
        stop = true;
        setTimedOut(true);
      }
    };
    const id = setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [active, minutes]);
  return timedOut;
}

/** What the server saw on the network while it waits for the proof transaction. */
const PENDING_TEXT: Record<string, string> = {
  waiting_for_confirmation: "Your transaction was seen. Waiting for it to confirm, about a minute.",
  failed_on_chain: "That transaction failed on the network. Send it again.",
  rpc_error: "Couldn't reach the Nimiq network just now. Trying again…",
  rpc_unavailable: "The Nimiq network isn't connected on this server.",
};

type Proof = { code: string; address: string; to: string; amountLuna: number; memo: string; minutes: number };

/** Sign in from a browser: paste your address, prove it with a one-luna transaction. */
export function AddressLogin() {
  const { acceptToken } = useWallet();
  const [address, setAddress] = useState("");
  const [proof, setProof] = useState<Proof | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState("");
  const valid = looksLikeNimiqAddress(address);

  const timedOut = usePoll(
    async () => {
      if (!proof) return false;
      const r = await api<{ status: "ok" | "pending"; token?: string; reason?: string }>("/api/auth/address/check", { code: proof.code });
      if (r.status === "ok" && r.token) {
        await acceptToken(r.token);
        return true;
      }
      setSeen(PENDING_TEXT[r.reason ?? ""] ?? "");
      return false;
    },
    proof?.minutes ?? 20,
    !!proof,
  );

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setProof(await api<Proof>("/api/auth/address/start", { address }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!proof) {
    return (
      <form onSubmit={start} className="grid gap-3">
        <p className="text-muted">
          Not in Nimiq Pay? Paste your <strong className="text-ink">Nimiq address</strong> (mainnet). You'll prove it's yours by sending one tiny transaction from it, with no password and no email.
        </p>
        <label className="block">
          <span className="label">Your Nimiq address</span>
          <input className="field mt-1 font-mono" placeholder="NQ07 0000 0000 0000 0000 0000 0000 0000 0000" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !valid}>{busy ? "One moment…" : "Continue"}</button>
      </form>
    );
  }

  return (
    <div className="grid gap-3" aria-live="polite">
      <p className="text-muted">
        Pasting the address isn't enough on its own: now <strong className="text-ink">send this one small transaction from <span className="break-all">{proof.address}</span></strong> in your wallet. It costs nothing but {nimText(proof.amountLuna)} NIM, and you're signed in automatically when it arrives.
      </p>
      <CopyField label="Send to" value={proof.to} />
      <CopyField label="Amount (NIM)" value={nimText(proof.amountLuna)} />
      <CopyField label="Message" value={proof.memo} />
      <WalletLink />
      <p className="flex items-center gap-2 text-sm text-muted"><span className="live-dot text-accent" aria-hidden="true" />{timedOut ? "This took too long. Start again." : seen || "Waiting for your transaction. This usually takes under a minute."}</p>
      <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => setProof(null)}>Use a different address</button>
    </div>
  );
}

/** Pay from any wallet: show who to pay, how much and the message, then wait for the server to find it. */
export function ManualPayPanel({ intent, onPaid }: { intent: { id: string; amountLuna: number; recipient: string; memo: string }; onPaid: () => void }) {
  const [error, setError] = useState("");
  const timedOut = usePoll(
    async () => {
      const r = await api<{ status: "confirmed" | "pending" | "failed"; reason?: string }>("/api/payments/check", { intentId: intent.id });
      if (r.status === "confirmed") {
        onPaid();
        return true;
      }
      if (r.status === "failed") {
        setError(r.reason ?? "Payment could not be verified.");
        return true;
      }
      return false;
    },
    15,
    true,
  );
  return (
    <div className="grid gap-3" aria-live="polite">
      <p className="text-muted">Send exactly this from any Nimiq wallet. The message is what links the payment to your purchase, so keep it as it is.</p>
      <CopyField label="Pay to" value={intent.recipient} />
      <CopyField label="Amount (NIM)" value={nimText(intent.amountLuna)} />
      <CopyField label="Message" value={intent.memo} />
      <WalletLink />
      {error ? (
        <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">{error}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted"><span className="live-dot text-accent" aria-hidden="true" />{timedOut ? "Still not seen. If you've sent it, it will unlock when it confirms: check your Library." : "Waiting for your payment. This page updates by itself."}</p>
      )}
    </div>
  );
}
