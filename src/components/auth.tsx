import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/components/toast";
import { AddressLogin } from "@/components/manual";

/** Wallet sign-in. Inside Nimiq Pay: sign a challenge. In a plain browser: paste your address and prove it on-chain (plus demo personas, if enabled). */
export function SignInPanel({ compact = false }: { compact?: boolean }) {
  const { me, inNimiqPay, connect, demoLogin } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {inNimiqPay ? (
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => run(connect)}>
          {busy ? "Waiting for Nimiq Pay…" : "Sign in with Nimiq Pay"}
        </button>
      ) : (
        <AddressLogin />
      )}
      {me?.config.demo && (
        <div className={`rounded-2xl border border-dashed border-white/20 p-3 ${compact ? "" : "mt-1"}`}>
          <p className="label mb-2">Demo mode · no wallet needed</p>
          <div className="grid grid-cols-3 gap-2">
            {(["fan", "artist", "admin"] as const).map((p) => (
              <button key={p} type="button" className="btn btn-ghost btn-sm capitalize" disabled={busy} onClick={() => run(() => demoLogin(p))}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
