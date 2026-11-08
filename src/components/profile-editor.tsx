import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { ArtworkEditor } from "@/components/artwork-editor";
import { AccentPicker, LinksEditor } from "@/components/profile-fields";
import { ProfileHeader } from "@/components/profile-header";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { USERNAME_MAX, USERNAME_MESSAGES, looksLikeAddressName, suggestUsername, usernameProblem } from "@shared/username";
import type { ArtistLink } from "@shared/artist";

type MyProfile = {
  username: string | null;
  name: string;
  bio: string;
  avatarKey: string | null;
  bannerKey: string | null;
  accent: string;
  links: ArtistLink[];
  showPass: boolean;
  nextUsernameChange: string | null;
  canChangeUsername: boolean;
};

type Remote = { name: string; available: boolean; message?: string };

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card grid gap-4 p-5">
      <div>
        <h2 className="display display-sm">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Make your profile yours: a live preview on top, then look, name, about, privacy.
 * `welcome` is the first-run version (a username is required); `edit` is the same form later on.
 */
export function ProfileEditor({ mode, next }: { mode: "welcome" | "edit"; next: string }) {
  const { me } = useWallet();
  const q = useQuery({ queryKey: ["my-profile", me?.user?.id], queryFn: () => api<MyProfile>("/api/me/profile"), enabled: !!me?.user, staleTime: 0, refetchOnWindowFocus: false });
  if (!me?.user || !q.data) return <Skeleton className="h-64 w-full" />;
  return <EditorForm mode={mode} next={next} saved={q.data} reload={() => void q.refetch()} />;
}

function EditorForm({ mode, next, saved, reload }: { mode: "welcome" | "edit"; next: string; saved: MyProfile; reload: () => void }) {
  const { refresh } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();

  // A wallet-address "name" from before usernames existed is not carried over.
  const hasName = !!saved.name && !looksLikeAddressName(saved.name) && saved.name !== "New listener";
  const [f, setF] = useState({
    username: saved.username ?? (hasName ? suggestUsername(saved.name) : ""),
    name: hasName ? saved.name : "",
    bio: saved.bio,
    accent: saved.accent,
    links: saved.links,
    showPass: saved.showPass,
  });
  const [remote, setRemote] = useState<Remote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current = saved.username;
  const username = f.username.trim().toLowerCase();
  const localProblem = username ? usernameProblem(username) : null;
  const needsServerCheck = !!username && !localProblem && username !== current;

  // Ask the server whether it's free, a moment after you stop typing. State is only set from the reply.
  useEffect(() => {
    if (!needsServerCheck) return;
    let live = true;
    const t = setTimeout(() => {
      api<{ available: boolean; message?: string }>(`/api/username/check?u=${encodeURIComponent(username)}`)
        .then((r) => live && setRemote({ name: username, ...r }))
        .catch(() => {});
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [username, needsServerCheck]);

  // What to show under the field, worked out from the above rather than stored.
  const check: { state: "idle" | "checking" | "ok" | "bad"; message?: string } = !username
    ? { state: "idle" }
    : localProblem
      ? { state: "bad", message: USERNAME_MESSAGES[localProblem] }
      : username === current
        ? { state: "ok", message: "This is your username." }
        : remote?.name === username
          ? remote.available
            ? { state: "ok", message: "Available." }
            : { state: "bad", message: remote.message ?? "That username is taken." }
          : { state: "checking" };

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const usernameLocked = !!current && !saved.canChangeUsername;
  const canSave = check.state === "ok";

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (username !== current) await api("/api/me/username", { username }, "PUT");
      await api("/api/me", { displayName: f.name.trim() || username, bio: f.bio, accent: f.accent, links: f.links, showPass: f.showPass }, "PATCH");
      await refresh();
      toast(mode === "welcome" ? "Welcome to NimStage!" : "Profile saved.", "ok");
      void navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const changed = () => {
    reload();
    void refresh();
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <div aria-label="Preview of your profile" role="group">
        <ProfileHeader
          p={{ name: f.name.trim() || username, username: username || null, bio: f.bio, avatarKey: saved.avatarKey, bannerKey: saved.bannerKey, accent: f.accent, links: f.links.filter((l) => l.label.trim() && /^https:\/\//.test(l.url)) }}
        />
      </div>

      <Card title="Your look" hint="JPEG, PNG or WebP up to 5 MB. We resize it and remove any location data. Without one, NimStage makes art for you.">
        <ArtworkEditor kind="avatar" id="me" path="/api/me/art/avatar" seed={`${username || "new"}-avatar`} current={saved.avatarKey} label="Profile picture" onChanged={changed} />
        <ArtworkEditor kind="banner" id="me" path="/api/me/art/banner" seed={`${username || "new"}-banner`} current={saved.bannerKey} label="Banner" onChanged={changed} />
        <AccentPicker value={f.accent} onChange={(v) => set("accent", v)} />
      </Card>

      <Card title="Your name" hint="Your username is your public handle. It's never your wallet address.">
        <label className="block">
          <span className="label">Username</span>
          <div className="relative mt-1">
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">@</span>
            <input
              className="field pl-9"
              value={f.username}
              onChange={(e) => set("username", e.target.value.replace(/\s/g, ""))}
              maxLength={USERNAME_MAX}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              required
              disabled={usernameLocked}
              aria-describedby="username-status"
              aria-invalid={check.state === "bad"}
              placeholder="yourname"
            />
          </div>
          <span id="username-status" role="status" className={`mt-1 flex min-h-6 items-center gap-1.5 text-sm ${check.state === "bad" ? "text-danger" : check.state === "ok" ? "text-ok" : "text-muted"}`}>
            {check.state === "ok" && <Check aria-hidden="true" size={16} />}
            {check.state === "bad" && <X aria-hidden="true" size={16} />}
            {check.state === "checking" ? "Checking…" : (check.message ?? `${USERNAME_MAX} characters at most. Letters, numbers and _.`)}
          </span>
          {usernameLocked && saved.nextUsernameChange && <span className="block text-sm text-muted">You can change it again on {new Date(saved.nextUsernameChange).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</span>}
          {mode === "edit" && !usernameLocked && current && <span className="block text-sm text-muted">After a change you can&apos;t change it again for a week. If you&apos;re an artist, your artist page address changes too.</span>}
        </label>
        <label className="block">
          <span className="label">Display name</span>
          <input className="field mt-1" value={f.name} maxLength={30} onChange={(e) => set("name", e.target.value)} placeholder={username || "How people see you"} autoComplete="nickname" />
        </label>
      </Card>

      <Card title="About you">
        <label className="block">
          <span className="label">Bio</span>
          <textarea className="field mt-1" rows={3} maxLength={160} value={f.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Songs, shows, what you're into…" />
          <span className="block text-right text-sm text-muted">{f.bio.length}/160</span>
        </label>
        <LinksEditor links={f.links} onChange={(l) => set("links", l)} />
      </Card>

      <Card title="Privacy">
        <label className="flex gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[#fa5d29]" checked={f.showPass} onChange={(e) => set("showPass", e.target.checked)} />
          <span>
            Show my Fan Pass level and badges on my profile
            <span className="block text-sm text-muted">Your purchases and wallet are never shown either way.</span>
          </span>
        </label>
      </Card>

      {error && (
        <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !canSave}>
        {busy ? "Saving…" : mode === "welcome" ? "Finish and continue" : "Save profile"}
      </button>
      {mode === "welcome" && <p className="text-center text-sm text-muted">You can change nearly everything later under Me → Edit profile.</p>}
    </form>
  );
}
