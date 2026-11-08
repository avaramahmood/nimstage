import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, Copy, Download } from "lucide-react";
import { Link } from "@/components/link";
import { SignInPanel } from "@/components/auth";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useTitle } from "@/lib/use-now";
import { shortAddress } from "@shared/units";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="display display-sm">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function LinkRow({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center justify-between gap-3 py-1">
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
    </Link>
  );
}

export default function SettingsPage() {
  useTitle("Settings");
  const { me, loading, logout, refresh } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();
  const user = me?.user;
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "name" | "out" | "delete" | "export">("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (loading)
    return (
      <div className="wrap pt-6">
        <h1 className="display display-lg">Settings</h1>
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  if (!user)
    return (
      <div className="wrap pt-6">
        <h1 className="display display-lg">Settings</h1>
        <p className="mt-3 text-muted">Sign in to manage your account.</p>
        <div className="mt-4"><SignInPanel /></div>
      </div>
    );

  const current = name ?? user.name;
  const changed = current.trim() !== user.name && current.trim().length >= 2;
  const demo = user.address.startsWith("DEMO");

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy("name");
    try {
      await api("/api/me", { displayName: current.trim() }, "PATCH");
      await refresh();
      setName(null);
      toast("Name updated.", "ok");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  /** Fetched with the session header (a plain link wouldn't carry it) and saved as a file. */
  async function downloadData() {
    setBusy("export");
    try {
      const data = await api("/api/me/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "nimstage-my-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(user!.address);
      toast("Address copied.", "ok");
    } catch {
      toast("Couldn't copy. Select the address and copy it manually.", "error");
    }
  }

  async function signOut() {
    setBusy("out");
    try {
      await logout();
      toast("Signed out.", "ok");
      void navigate("/");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      await api("/api/me", { confirm }, "DELETE");
      await refresh();
      toast("Your account was deleted.", "ok");
      void navigate("/");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  const canDelete = user.role === "fan" && !me?.artist;

  return (
    <div className="wrap grid gap-4 pt-6">
      <h1 className="display display-lg">Settings</h1>

      <Block title="Profile">
        <form onSubmit={saveName} className="grid gap-3">
          <label className="block">
            <span className="label">Display name</span>
            <input className="field mt-1" value={current} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={30} autoComplete="nickname" />
            <span className="mt-1 block text-sm text-muted">Shown in live chat and on your receipts.</span>
          </label>
          <button type="submit" className="btn btn-primary w-full" disabled={!changed || busy === "name"}>
            {busy === "name" ? "Saving…" : "Save name"}
          </button>
        </form>
      </Block>

      <Block title="Wallet">
        <p className="label">{demo ? "Demo account" : "Connected wallet"}</p>
        <p className="break-all font-mono text-sm">{demo ? "No wallet (demo)" : shortAddress(user.address)}</p>
        {!demo && (
          <button type="button" className="btn btn-ghost w-full" onClick={() => void copyAddress()}>
            <Copy aria-hidden="true" size={18} /> Copy address
          </button>
        )}
        <p className="text-sm text-muted">Signing in never spends NIM. Each payment asks you to confirm it in Nimiq Pay.</p>
      </Block>

      <Block title="Activity">
        <LinkRow href="/receipts" title="Receipts" body="Payments you've made" />
        <LinkRow href="/library" title="Library" body="Tickets, memberships and purchased tracks" />
        {me?.artist && <LinkRow href="/studio" title="Artist studio" body={`Manage @${me.artist.handle}`} />}
      </Block>

      <Block title="About">
        <LinkRow href="/help" title="Help" body="How signing in and paying work" />
        <LinkRow href="/terms" title="Terms of use" body="The rules, in plain language" />
        <LinkRow href="/privacy" title="Privacy" body="What NimStage stores about you" />
        <LinkRow href="/policy" title="Content & rights" body="What's allowed, and how takedowns work" />
        <LinkRow href="/about" title="About NimStage" body="What this app is" />
      </Block>

      <Block title="Your data">
        <button type="button" className="btn btn-ghost w-full" disabled={busy === "export"} onClick={() => void downloadData()}>
          <Download aria-hidden="true" size={18} /> {busy === "export" ? "Preparing…" : "Download my data"}
        </button>
      </Block>

      <button type="button" className="btn btn-ghost w-full" disabled={busy === "out"} onClick={() => void signOut()}>
        {busy === "out" ? "Signing out…" : "Sign out"}
      </button>

      <Block title="Delete account">
        {!canDelete ? (
          <p className="text-sm text-muted">Artist and admin accounts can&apos;t be deleted here, because shows and listings depend on them. Ask an admin to help.</p>
        ) : !deleting ? (
          <>
            <p className="text-sm text-muted">This removes your activity, your access to anything you bought, and signs you out. It can&apos;t be undone. Payments already sent to artists can&apos;t be refunded.</p>
            <button type="button" className="btn btn-ghost w-full border-danger/50 text-danger" onClick={() => setDeleting(true)}>
              Delete my account…
            </button>
          </>
        ) : (
          <div className="grid gap-3">
            <label className="block">
              <span className="label">Type DELETE to confirm</span>
              <input className="field mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            </label>
            <button type="button" className="btn w-full bg-danger text-accent-ink" disabled={confirm !== "DELETE" || busy === "delete"} onClick={() => void deleteAccount()}>
              {busy === "delete" ? "Deleting…" : "Delete my account for good"}
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={() => { setDeleting(false); setConfirm(""); }}>
              Keep my account
            </button>
          </div>
        )}
      </Block>
    </div>
  );
}
