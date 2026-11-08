import { useState } from "react";
import { useNavigate } from "react-router";
import { Shuffle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

/** "Surprise me": jumps to a random artist. `variant="link"` is the small text version used on Home. */
export function SurpriseButton({ variant = "pill" }: { variant?: "pill" | "link" }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const { handle } = await api<{ handle: string | null }>("/api/surprise");
      if (handle) void navigate(`/artist/${handle}`);
      else toast("No artists yet. Be the first!");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return variant === "link" ? (
    <button type="button" onClick={go} disabled={busy} className="font-medium text-accent underline underline-offset-4">
      Surprise me
    </button>
  ) : (
    <button type="button" onClick={go} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-ink transition-transform hover:-translate-y-0.5 disabled:opacity-60">
      <Shuffle aria-hidden="true" size={16} /> Surprise me
    </button>
  );
}
