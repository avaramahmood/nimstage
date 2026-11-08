import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { KeyRound, ShieldCheck, WalletMinimal } from "lucide-react";
import { Link } from "@/components/link";
import { SignInPanel } from "@/components/auth";
import { useWallet } from "@/lib/wallet";
import { useTitle } from "@/lib/use-now";

/** Only ever go back to a path inside this app: never an absolute or protocol-relative URL. */
export const safeNext = (raw: string | null) => (raw && raw.startsWith("/") && raw[1] !== "/" && raw[1] !== "\\" ? raw : "/");

export default function SignInPage() {
  useTitle("Sign in");
  const { me, loading } = useWallet();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (me?.user) void navigate(next, { replace: true });
  }, [me?.user, navigate, next]);

  return (
    <div className="wrap pt-8">
      <h1 className="display display-lg">Sign in</h1>
      <p className="mt-3 text-lg text-muted">Use your Nimiq wallet. There's no password and no email.</p>

      <div className="card mt-6 p-5">{loading ? <p className="text-muted">One moment…</p> : <SignInPanel />}</div>

      <ul className="mt-8 grid gap-4">
        <li className="flex gap-3">
          <KeyRound aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-accent" />
          <p>
            <strong className="block">You sign a one-time message</strong>
            <span className="text-muted">In Nimiq Pay you sign a short note. In a browser you send one tiny transaction from your address. Either proves the wallet is yours.</span>
          </p>
        </li>
        <li className="flex gap-3">
          <ShieldCheck aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-blue" />
          <p>
            <strong className="block">It can't move your NIM</strong>
            <span className="text-muted">Signing in never spends anything. Each payment asks you to confirm it separately.</span>
          </p>
        </li>
        <li className="flex gap-3">
          <WalletMinimal aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-ok" />
          <p>
            <strong className="block">Artists are paid directly</strong>
            <span className="text-muted">NIM goes straight to the artist's wallet. NimStage never holds it.</span>
          </p>
        </li>
      </ul>

      <p className="mt-8 text-sm text-muted">
        By signing in you agree to the <Link href="/policy" className="underline underline-offset-4">content &amp; rights policy</Link>.
      </p>
    </div>
  );
}
