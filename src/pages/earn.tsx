import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { Link } from "@/components/link";
import { useToast } from "@/components/toast";
import { useWallet } from "@/lib/wallet";
import { useTitle } from "@/lib/use-now";
import { ESTIMATE_APY, MIN_STAKE_NIM, payoutText, usePosition, useValidators, yearlyEstimate, type Validator } from "@/lib/earn";
import { formatNim, looksLikeNimiqAddress, lunaToNim, nimToLuna } from "@shared/units";

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** The four things to know about any position, in plain words (shown before anything is staked). */
function Risks() {
  const rows: [string, string][] = [
    ["Where it goes", "Your NIM is staked on the Nimiq network itself. NimStage never holds it: you confirm every step inside Nimiq Pay."],
    ["The rate varies", `Rewards depend on the network and the pool you choose, and are never guaranteed. A rough guide is about ${Math.round(ESTIMATE_APY * 100)}% a year before the pool's fee.`],
    ["What can go wrong", "A pool that goes offline earns less, pools keep a fee, and software can have bugs. There is no insurance."],
    ["Getting out", "Unstaking isn't instant: there is a waiting period before your NIM is back in your wallet."],
  ];
  return (
    <section aria-label="What to know before staking" className="card p-5">
      <h2 className="display display-sm flex items-center gap-2"><ShieldCheck aria-hidden="true" size={20} className="text-blue" /> Before you stake</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="label">{k}</dt>
            <dd className="mt-1 text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ValidatorChoice({ validators, value, onChange, locked }: { validators: Validator[]; value: string; onChange: (a: string) => void; locked?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = locked ? validators.filter((v) => v.address === value) : all ? validators : validators.slice(0, 6);
  return (
    <fieldset className="grid gap-2" disabled={locked}>
      <legend className="label mb-1">Pool (validator)</legend>
      {shown.map((v) => (
        <label key={v.address} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${value === v.address ? "border-accent bg-accent/10" : "border-line bg-white/[0.03]"}`}>
          <input type="radio" name="validator" className="mt-1 h-5 w-5 accent-[#fa5d29]" checked={value === v.address} onChange={() => onChange(v.address)} />
          <span className="min-w-0">
            <span className="block font-medium">{v.name}</span>
            <span className="block text-sm text-muted">
              Reliability {pct(v.score)} · Fee {pct(v.fee)}
              {v.stakers !== null ? ` · ${v.stakers} stakers` : ""}
            </span>
            <span className="block text-sm text-muted">{payoutText(v)}</span>
          </span>
        </label>
      ))}
      {!locked && validators.length > 6 && (
        <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => setAll((x) => !x)}>
          {all ? "Show fewer" : `Show all ${validators.length}`}
        </button>
      )}
    </fieldset>
  );
}

export default function EarnPage() {
  useTitle("Earn");
  const { inNimiqPay, nimiq } = useWallet();
  const toast = useToast();
  const vq = useValidators();
  const validators = useMemo(() => vq.data?.validators ?? [], [vq.data]);

  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null); // luna
  const [network, setNetwork] = useState<string>("mainnet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [watching, setWatching] = useState(false);
  const pos = usePosition(address, watching ? 6000 : false);
  const staker = pos.data?.staker ?? null;
  const hasStaker = !!staker && (staker.balance > 0 || staker.inactiveBalance > 0 || staker.retiredBalance > 0 || !!staker.delegation);

  const [chosen, setChoice] = useState("");
  const [amount, setAmount] = useState("");
  // default to the most reliable pool that actually pays rewards out; someone who already stakes keeps their validator
  const fallback = useMemo(() => validators.find((v) => v.payoutType !== "none")?.address ?? validators[0]?.address ?? "", [validators]);
  const choice = staker?.delegation ?? (chosen || fallback);

  // stop watching for the new position after a minute and a half
  useEffect(() => {
    if (!watching) return;
    const t = setTimeout(() => setWatching(false), 90_000);
    return () => clearTimeout(t);
  }, [watching]);

  const picked = validators.find((v) => v.address === choice);
  const nim = Number(amount);
  const valid = Number.isFinite(nim) && nim > 0 && (hasStaker || nim >= MIN_STAKE_NIM) && (balance === null || nimToLuna(nim) <= balance);
  const mainnet = network === "mainnet";

  async function connect() {
    setError("");
    setBusy(true);
    try {
      const sdk = await nimiq();
      if (!sdk) throw new Error("Open NimStage inside Nimiq Pay to stake.");
      const accounts = await sdk.listAccounts();
      if (!accounts.length) throw new Error("No account was shared.");
      // the host says which network it is on; the SDK call may be sync or async, so await either
      setNetwork(String(window.nimiqPay?.network ?? (await Promise.resolve(sdk.getNetwork?.())) ?? "mainnet").toLowerCase());
      setBalance(await sdk.getBalance(accounts[0]));
      setAddress(accounts[0]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function stake() {
    if (!valid || !picked) return;
    setError("");
    setBusy(true);
    try {
      const sdk = await nimiq();
      if (!sdk) throw new Error("Open NimStage inside Nimiq Pay to stake.");
      if (!looksLikeNimiqAddress(picked.address)) throw new Error("That pool's address looks wrong, so I won't use it. Pick another pool.");
      const value = nimToLuna(nim);
      const sent = hasStaker ? await sdk.sendStakeTransaction({ value }) : await sdk.sendNewStakerTransaction({ delegation: picked.address, value });
      // the wallet answers with a transaction hash; anything else (an error object) means nothing was sent
      if (typeof sent !== "string" || !sent) throw new Error("Nimiq Pay didn't send that. Check your wallet before trying again.");
      toast("Sent. Your stake shows up here in a moment.", "ok");
      setAmount("");
      setWatching(true);
      if (address) setBalance(await sdk.getBalance(address));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap max-w-3xl pt-6 md:pt-8">
      <h1 className="display display-lg">Earn with NIM</h1>
      <p className="mt-3 text-lg text-muted">Staking puts your NIM to work helping run the Nimiq network, and you earn rewards for it. You keep your NIM; you can unstake later.</p>

      <div className="mt-6 grid gap-4">
        <Risks />

        {!inNimiqPay && (
          <p className="flex gap-3 rounded-2xl border border-line bg-white/[0.04] p-4 text-muted">
            <AlertTriangle aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
            <span>Staking happens inside <strong className="text-ink">Nimiq Pay</strong>, where your wallet can sign. Open NimStage there to stake. You can browse the pools below.</span>
          </p>
        )}

        {inNimiqPay && !address && (
          <div className="card grid gap-3 p-5">
            <h2 className="display display-sm">Your staking</h2>
            <p className="text-muted">Share your Nimiq Pay address to see your balance and what you already have staked.</p>
            {error && <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">{error}</p>}
            <button type="button" className="btn btn-primary w-full sm:w-fit" disabled={busy} onClick={() => void connect()}>{busy ? "Waiting for Nimiq Pay…" : "Show my staking"}</button>
          </div>
        )}

        {inNimiqPay && address && (
          <div className="card grid gap-4 p-5" aria-live="polite">
            <h2 className="display display-sm">Your staking</h2>
            {!mainnet && <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">Nimiq Pay is on {network}. These pools are on mainnet, so staking is turned off here.</p>}
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-3"><dt className="label">In your wallet</dt><dd className="display display-sm mt-1">{balance === null ? "…" : formatNim(balance, "0 NIM")}</dd></div>
              <div className="rounded-2xl bg-white/[0.04] p-3"><dt className="label">Staked</dt><dd className="display display-sm mt-1">{pos.isLoading ? "…" : formatNim(staker?.balance ?? 0, "0 NIM")}</dd></div>
            </dl>
            {staker && (staker.inactiveBalance > 0 || staker.retiredBalance > 0) && (
              <p className="text-sm text-muted">
                {staker.inactiveBalance > 0 && <>Waiting to unstake: {formatNim(staker.inactiveBalance)}. </>}
                {staker.retiredBalance > 0 && <>Ready to withdraw: {formatNim(staker.retiredBalance)}. </>}
                Finish unstaking in the Staking screen of Nimiq Pay.
              </p>
            )}
            {(pos.isError || (pos.data && !pos.data.available)) && <p className="text-sm text-muted">Couldn't read your staking position just now. Your wallet in Nimiq Pay always shows the truth.</p>}
          </div>
        )}

        <section aria-label="Pools" className="card grid gap-4 p-5">
          <h2 className="display display-sm">{hasStaker ? "Your pool" : "Choose a pool"}</h2>
          {vq.isLoading && <p className="text-muted">Loading pools…</p>}
          {vq.isError && <p role="alert" className="text-danger">The list of pools is unavailable right now. Try again in a minute.</p>}
          {validators.length > 0 && <ValidatorChoice validators={validators} value={choice} onChange={setChoice} locked={hasStaker && !!staker?.delegation && validators.some((v) => v.address === staker.delegation)} />}
          <p className="text-sm text-muted">
            Pools come from Nimiq's official list, ranked by reliability. Pools pay rewards on their own schedule and keep a fee. NimStage isn't affiliated with any pool and earns nothing from your stake.
          </p>

          {inNimiqPay && address && mainnet && (
            <form
              className="grid gap-3 border-t border-line pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void stake();
              }}
            >
              <label className="block">
                <span className="label">Amount to {hasStaker ? "add" : "stake"} (NIM)</span>
                <input className="field mt-1" inputMode="decimal" placeholder={hasStaker ? "e.g. 50" : `At least ${MIN_STAKE_NIM}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                {balance !== null && balance >= nimToLuna(1) && (
                  <button type="button" className="mt-2 text-sm underline underline-offset-4" onClick={() => setAmount(String(Math.floor(lunaToNim(balance))))}>
                    Use everything in my wallet ({Math.floor(lunaToNim(balance))} NIM)
                  </button>
                )}
              </label>
              {nim > 0 && picked && (
                <p className="text-sm text-muted">
                  Roughly <strong className="text-ink">{yearlyEstimate(nim, picked.fee).toLocaleString("en-US", { maximumFractionDigits: 1 })} NIM</strong> a year after {picked.name}'s {pct(picked.fee)} fee. That's an estimate, not a promise: real rewards vary.
                </p>
              )}
              {!hasStaker && nim > 0 && nim < MIN_STAKE_NIM && <p className="text-sm text-danger">The minimum to start staking is {MIN_STAKE_NIM} NIM.</p>}
              {balance !== null && nim > 0 && nimToLuna(nim) > balance && <p className="text-sm text-danger">That's more than you have in your wallet.</p>}
              {error && <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">{error}</p>}
              <button type="submit" className="btn btn-primary w-full sm:w-fit" disabled={busy || !valid || !picked}>
                {busy ? "Confirm in Nimiq Pay…" : hasStaker ? "Add to my stake" : "Stake"}
              </button>
              {watching && <p className="flex items-center gap-2 text-sm text-muted"><Check aria-hidden="true" size={16} /> Waiting for the network to show your stake…</p>}
            </form>
          )}
        </section>

        <p className="text-sm text-muted">
          Artists: your earnings from tickets, tracks and tips can go here too. <Link href="/studio" className="underline underline-offset-4">Back to the Studio</Link>
        </p>
      </div>
    </div>
  );
}

function friendlyError(e: unknown): string {
  const err = e as { type?: string; message?: string };
  if (err?.type === "PERMISSION_DENIED") return "Cancelled in Nimiq Pay.";
  if (err?.type === "INVALID_TRANSACTION") return "Nimiq Pay couldn't build that transaction. Check the amount and try again.";
  if (err?.type === "NETWORK_ERROR") return "Network hiccup. Check your wallet before trying again.";
  return e instanceof Error ? e.message : "Something went wrong.";
}
