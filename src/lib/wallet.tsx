import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "@/lib/nav";
import { api, randomHex, sleep } from "./api";
import { getToken, setMediaToken, setToken } from "./session";
import { checkNewBadges, primeBadges } from "./pass";
import { useToast } from "@/components/toast";

export type Me = {
  user: { id: string; name: string; username: string | null; avatarKey: string | null; accent: string; role: "fan" | "artist" | "admin"; address: string; needsUsername: boolean } | null;
  artist: { id: string; handle: string; name: string } | null;
  config: { demo: boolean; demoPayments: boolean };
};

export type PayRequest = { kind: "ticket" | "tip" | "membership" | "track"; refId?: string; amountLuna?: number };
/** Thrown by pay() outside Nimiq Pay: the payment is made by hand from any wallet, and this carries what to send. */
export class ManualPay extends Error {
  constructor(public intent: { id: string; amountLuna: number; recipient: string; memo: string }) {
    super("Pay from your wallet");
  }
}
export type PayStage = "preparing" | "wallet" | "verifying";

type Ctx = {
  me: Me | null;
  loading: boolean;
  /** true when running inside Nimiq Pay (the host injects window.nimiqPay). */
  inNimiqPay: boolean;
  connect: () => Promise<void>;
  demoLogin: (persona: "fan" | "artist" | "admin") => Promise<void>;
  logout: () => Promise<void>;
  pay: (req: PayRequest, onStage?: (s: PayStage) => void) => Promise<void>;
  /** After a payment confirmed outside pay() (a manual payment): refresh pages and check for new badges. */
  paid: () => void;
  /** Take a session token from a sign-in that happened elsewhere (the address-proof flow). */
  acceptToken: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
};

/** Plain-English messages for the wallet's normalized error types. */
function friendly(e: unknown): Error {
  const err = e as { type?: string; message?: string; name?: string };
  if (err?.type === "PERMISSION_DENIED") return new Error("Cancelled in Nimiq Pay.");
  if (err?.type === "INVALID_TRANSACTION") return new Error("Nimiq Pay couldn't build that payment. Check your balance and try again.");
  if (err?.type === "NETWORK_ERROR") return new Error("Network hiccup. Check your wallet history before paying again.");
  return e instanceof Error ? e : new Error("Something went wrong.");
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // The host injects window.nimiqPay before page scripts run. useSyncExternalStore reads it
  // without an effect and renders `false` on the server, so hydration stays consistent.
  const inNimiqPay = useSyncExternalStore(
    () => () => {},
    () => "nimiqPay" in window,
    () => false,
  );
  const sdk = useRef<Promise<import("@nimiq/mini-app-sdk").NimiqProvider | null> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Me>("/api/me");
      setMe(data);
      if (data.user) void api<{ token: string }>("/api/me/media-token").then((r) => setMediaToken(r.token), () => {});
      else {
        setMediaToken(null);
        if (getToken()) setToken(null); // a stored token the server no longer accepts
      }
      // Remember which badges this user already has, so only new unlocks trigger a toast.
      if (data.user) void primeBadges(data.user.id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const provider = useCallback(() => {
    sdk.current ??= import("@nimiq/mini-app-sdk").then((m) => m.init()).catch(() => null);
    return sdk.current;
  }, []);

  const connect = useCallback(async () => {
    const nimiq = await provider();
    if (!nimiq) throw new Error("Open NimStage inside Nimiq Pay, or paste your address to sign in from this browser.");
    try {
      await nimiq.listAccounts(); // asks the user to share their address
      const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/challenge", {});
      const signed = await nimiq.sign(message);
      const r = await api<{ token?: string }>("/api/auth/verify", { nonce, publicKey: signed.publicKey, signature: signed.signature });
      setToken(r.token ?? null);
    } catch (e) {
      throw friendly(e);
    }
    await refresh();
    router.refresh();
  }, [provider, refresh, router]);

  const demoLogin = useCallback(
    async (persona: "fan" | "artist" | "admin") => {
      const r = await api<{ token?: string }>("/api/auth/demo", { persona });
      setToken(r.token ?? null);
      await refresh();
      router.refresh();
    },
    [refresh, router],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", {});
    setToken(null);
    setMediaToken(null);
    await refresh();
    router.refresh();
  }, [refresh, router]);

  const pay = useCallback(
    async (req: PayRequest, onStage?: (s: PayStage) => void) => {
      onStage?.("preparing");
      const { intent } = await api<{ intent: { id: string; amountLuna: number; recipient: string; memo: string } }>("/api/payments/intent", req);

      let txHash: string;
      onStage?.("wallet");
      const nimiq = inNimiqPay ? await provider() : null;
      if (nimiq) {
        try {
          // The memo (<=64 bytes) goes on-chain so the server can match payment to purchase.
          txHash = await nimiq.sendBasicTransactionWithData({ recipient: intent.recipient, value: intent.amountLuna, data: intent.memo });
        } catch (e) {
          throw friendly(e);
        }
      } else if (me?.config.demoPayments) {
        await sleep(700);
        txHash = `demo-${randomHex(8)}`;
      } else {
        // A normal browser: no wallet to call. The buyer sends the payment by hand and the server finds it by its memo.
        throw new ManualPay(intent);
      }

      onStage?.("verifying");
      for (let i = 0; i < 25; i++) {
        const r = await api<{ status: "confirmed" | "pending" | "failed"; reason?: string }>("/api/payments/confirm", { intentId: intent.id, txHash });
        if (r.status === "confirmed") {
          router.refresh();
          if (me?.user) {
            void checkNewBadges(me.user.id).then((names) => {
              if (names.length) toast(`Badge unlocked: ${names.join(", ")}`, "ok");
            });
          }
          return;
        }
        if (r.status === "failed") throw new Error(r.reason ?? "Payment could not be verified.");
        await sleep(2000);
      }
      throw new Error("Still waiting for the network. Your access will unlock as soon as the payment confirms.");
    },
    [inNimiqPay, me, provider, router, toast],
  );

  const acceptToken = useCallback(
    async (token: string) => {
      setToken(token);
      await refresh();
      router.refresh();
    },
    [refresh, router],
  );

  const paid = useCallback(() => {
    router.refresh();
    if (me?.user) {
      void checkNewBadges(me.user.id).then((names) => {
        if (names.length) toast(`Badge unlocked: ${names.join(", ")}`, "ok");
      });
    }
  }, [me, router, toast]);

  const value = useMemo(
    () => ({ me, loading, inNimiqPay, connect, demoLogin, logout, pay, paid, acceptToken, refresh }),
    [me, loading, inNimiqPay, connect, demoLogin, logout, pay, paid, acceptToken, refresh],
  );
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
