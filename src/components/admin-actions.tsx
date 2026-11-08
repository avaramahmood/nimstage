import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function act(path: string, body: unknown) {
    setBusy(true);
    try {
      await api(path, body);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return { busy, act };
}

export function AdminActions({ id }: { id: string }) {
  const { busy, act } = useAct();
  return (
    <div className="mt-3 flex gap-2">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act("/api/admin/reports", { id, action: "dismiss" })}>Dismiss</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act("/api/admin/reports", { id, action: "takedown" })}>Take down</button>
    </div>
  );
}

export function ArtistAdmin({ id, verified, suspended }: { id: string; verified: boolean; suspended: boolean }) {
  const { busy, act } = useAct();
  return (
    <div className="mt-2 flex gap-2">
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={verified} disabled={busy} onClick={() => act("/api/admin/artists", { id, verified: !verified })}>{verified ? "Unverify" : "Verify"}</button>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={suspended} disabled={busy} onClick={() => act("/api/admin/artists", { id, suspended: !suspended })}>{suspended ? "Reinstate" : "Suspend"}</button>
    </div>
  );
}
