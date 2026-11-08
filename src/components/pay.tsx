import { useState, type ReactNode } from "react";
import { Check, Ticket } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { SignInPanel } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ManualPayPanel } from "@/components/manual";
import { ManualPay, useWallet, type PayRequest, type PayStage } from "@/lib/wallet";
import { formatNim, MAX_NIM, nimToLuna, TIP_PRESETS_NIM } from "@shared/units";
import { celebrate } from "@/lib/fun";

/** The stub the buyer holds: cream card, side notches, dashed perforation (Design Bomb ticket anatomy). */
export function TicketStub({ title, meta, price, serial, torn = false, glare = false }: { title: string; meta: string; price: string; serial: string; torn?: boolean; glare?: boolean }) {
  return (
    <div className={`ticket ${torn ? "opacity-90" : ""}`} style={{ ["--perf" as string]: "108px" }}>
      <div className="flex h-[108px] items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="display display-sm line-clamp-2 break-words">{title}</p>
          <p className="mt-1 truncate text-sm text-cream-muted">{meta}</p>
        </div>
        <p className="display display-sm shrink-0">{price}</p>
      </div>
      <div className="ticket-perf" />
      <div className="flex items-center justify-between gap-3 p-5">
        <p className="font-mono text-xs uppercase text-cream-muted">Admit one · {serial}</p>
        <Ticket aria-hidden="true" size={20} />
      </div>
      {glare && <div aria-hidden="true" className="glare" />}
    </div>
  );
}

const STAGE_TEXT: Record<PayStage, string> = {
  preparing: "Preparing your payment…",
  wallet: "Confirm in Nimiq Pay…",
  verifying: "Verifying on the Nimiq network…",
};

export function PaySheet({
  open,
  onClose,
  request,
  title,
  meta,
  priceLuna,
  label,
  doneText,
}: {
  open: boolean;
  onClose: () => void;
  request: PayRequest;
  title: string;
  meta: string;
  priceLuna: number;
  label: string;
  doneText: string;
}) {
  const { me, pay, paid } = useWallet();
  const toast = useToast();
  const [stage, setStage] = useState<PayStage | null>(null);
  const [manual, setManual] = useState<ManualPay["intent"] | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    try {
      await pay(request, setStage);
      setDone(true);
      celebrate();
      toast(doneText, "ok");
    } catch (e) {
      if (e instanceof ManualPay) setManual(e.intent);
      else setError((e as Error).message);
    } finally {
      setStage(null);
    }
  }

  const serial = (request.refId ?? "tip").slice(0, 6).toUpperCase();

  return (
    <Sheet open={open} onClose={onClose} title={done ? "You're in." : title} label={label}>
      <TicketStub title={title} meta={meta} price={formatNim(priceLuna)} serial={serial} torn={done} />
      <div className="mt-5 grid gap-3" aria-live="polite">
        {done ? (
          <>
            <p className="flex items-center gap-2 text-ok">
              <Check aria-hidden="true" size={20} /> {doneText}
            </p>
            <button type="button" className="btn btn-primary w-full" onClick={onClose}>
              Continue
            </button>
          </>
        ) : !me?.user ? (
          <>
            <p className="text-muted">Sign in to buy. Your wallet confirms every payment, and NimStage never holds your funds.</p>
            <SignInPanel compact />
          </>
        ) : manual ? (
          <ManualPayPanel
            intent={manual}
            onPaid={() => {
              paid();
              setDone(true);
              celebrate();
              toast(doneText, "ok");
            }}
          />
        ) : (
          <>
            <button type="button" className="btn btn-primary w-full" disabled={!!stage} onClick={go}>
              {stage ? STAGE_TEXT[stage] : `Pay ${formatNim(priceLuna)}`}
            </button>
            {error && (
              <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">
                {error}
              </p>
            )}
            <p className="text-sm text-muted">The payment goes straight to the artist&apos;s wallet. There is no platform fee.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Button + sheet for one-tap purchases. */
export function BuyButton({
  request,
  title,
  meta,
  priceLuna,
  label,
  cta,
  doneText,
  className = "btn btn-primary",
  children,
}: {
  request: PayRequest;
  title: string;
  meta: string;
  priceLuna: number;
  label: string;
  cta?: string;
  doneText: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children ?? cta ?? `Get it · ${formatNim(priceLuna)}`}
      </button>
      <PaySheet open={open} onClose={() => setOpen(false)} request={request} title={title} meta={meta} priceLuna={priceLuna} label={label} doneText={doneText} />
    </>
  );
}

export function TipButton({ target, artistName, className = "btn btn-ghost" }: { target: string; artistName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [nim, setNim] = useState(2);
  const [custom, setCustom] = useState("");
  const amount = custom ? Number(custom) : nim;
  const valid = Number.isFinite(amount) && amount >= 0.1 && amount <= MAX_NIM;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Tip
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Tip ${artistName}`} label="Goes straight to the artist">
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Tip amount in NIM">
          {TIP_PRESETS_NIM.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={!custom && nim === p}
              onClick={() => {
                setNim(p);
                setCustom("");
              }}
              className={`min-h-12 rounded-full border font-mono ${!custom && nim === p ? "border-accent bg-accent text-accent-ink" : "border-line bg-white/[0.04]"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="label">Or a custom amount (NIM)</span>
          <input className="field mt-1" inputMode="decimal" placeholder="e.g. 2.5" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <div className="mt-4">
          {valid ? (
            <TipPay open={open} onClose={() => setOpen(false)} target={target} amount={amount} />
          ) : (
            <p className="text-muted">Enter between 0.1 and {MAX_NIM} NIM.</p>
          )}
        </div>
      </Sheet>
    </>
  );
}

function TipPay({ target, amount, onClose }: { open: boolean; onClose: () => void; target: string; amount: number }) {
  const { me, pay, paid } = useWallet();
  const toast = useToast();
  const [stage, setStage] = useState<PayStage | null>(null);
  const [manual, setManual] = useState<ManualPay["intent"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!me?.user) return <SignInPanel compact />;

  async function go() {
    setError(null);
    try {
      await pay({ kind: "tip", refId: target, amountLuna: nimToLuna(amount) }, setStage);
      celebrate(18);
      toast("Tip sent. Thank you!", "ok");
      onClose();
    } catch (e) {
      if (e instanceof ManualPay) setManual(e.intent);
      else setError((e as Error).message);
    } finally {
      setStage(null);
    }
  }

  if (manual) {
    return (
      <ManualPayPanel
        intent={manual}
        onPaid={() => {
          paid();
          celebrate(18);
          toast("Tip sent. Thank you!", "ok");
          onClose();
        }}
      />
    );
  }

  return (
    <div className="grid gap-3" aria-live="polite">
      <button type="button" className="btn btn-primary w-full" disabled={!!stage} onClick={go}>
        {stage ? STAGE_TEXT[stage] : `Send ${formatNim(nimToLuna(amount))}`}
      </button>
      {error && (
        <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
