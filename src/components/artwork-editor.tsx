import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Cover } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/api";
import { useRouter } from "@/lib/nav";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

type Kind = "avatar" | "banner" | "track" | "show";

/**
 * Upload / replace / remove one piece of artwork. The server resizes and re-encodes it, so any phone photo
 * is fine; with no image the generated art is shown. `compact` is a small thumbnail button for list rows.
 */
export function ArtworkEditor({ kind, id, seed, current, label, compact = false }: { kind: Kind; id: string; seed: string; current?: string | null; label: string; compact?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const path = `/api/studio/art/${kind}/${id}`;
  const shape = kind === "avatar" ? "rounded-full" : kind === "banner" ? "rounded-2xl" : "rounded-xl";

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return void toast("Use a JPEG, PNG or WebP image.", "error");
    if (file.size > MAX_BYTES) return void toast("That image is over 5 MB. Pick a smaller one.", "error");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      await api(path, form, "PUT");
      toast(`${label} updated.`, "ok");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(path, undefined, "DELETE");
      toast(`${label} removed.`, "ok");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const picker = <input ref={input} id={inputId} type="file" accept={ACCEPT} aria-label={`${label}: choose an image`} tabIndex={-1} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />;

  if (compact) {
    const thumb = (
      <span className="relative block h-11 w-11 overflow-hidden rounded-xl border border-line">
        <Cover seed={seed} image={current} className="h-full w-full" />
        <span className="absolute bottom-0.5 right-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/75 text-ink">
          <ImagePlus aria-hidden="true" size={12} />
        </span>
      </span>
    );
    // With no image there is only one thing to do. With one, a small menu keeps "remove cover" well away
    // from the "Remove" link that deletes the whole track or show.
    if (!current) {
      return (
        <span className="shrink-0">
          {picker}
          <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label={`Add cover for ${label}`}>
            {thumb}
          </button>
        </span>
      );
    }
    return (
      <details className="relative shrink-0" ref={menu}>
        <summary className="list-none [&::-webkit-details-marker]:hidden" aria-label={`Cover options for ${label}`}>
          <span className="block cursor-pointer">{thumb}</span>
        </summary>
        <div className="absolute right-0 top-12 z-30 grid w-44 gap-1 rounded-2xl border border-line bg-surface-2 p-2 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)]">
          {picker}
          <button type="button" disabled={busy} className="btn btn-ghost btn-sm justify-start" onClick={() => { menu.current?.removeAttribute("open"); input.current?.click(); }}>
            <ImagePlus aria-hidden="true" size={16} /> Change cover
          </button>
          <button type="button" disabled={busy} className="btn btn-ghost btn-sm justify-start" onClick={() => { menu.current?.removeAttribute("open"); void remove(); }}>
            <Trash2 aria-hidden="true" size={16} /> Remove cover
          </button>
        </div>
      </details>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="label">{label}</p>
      <Cover seed={seed} image={current} className={`${kind === "avatar" ? "h-28 w-28" : "h-28 w-full"} ${shape} border border-line`} />
      {picker}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-ghost btn-sm">
          <ImagePlus aria-hidden="true" size={16} /> {busy ? "Uploading…" : current ? "Replace" : "Upload"}
        </button>
        {current && (
          <button type="button" disabled={busy} onClick={() => void remove()} className="btn btn-ghost btn-sm">
            <Trash2 aria-hidden="true" size={16} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
