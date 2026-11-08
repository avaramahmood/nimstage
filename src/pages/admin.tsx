import { Link } from "@/components/link";
import { AdminActions, ArtistAdmin } from "@/components/admin-actions";
import { EmptyState, SectionTitle } from "@/components/ui";
import { stateOf } from "@/components/page-state";
import { useAdmin } from "@/lib/queries";
import { useTitle } from "@/lib/use-now";
import { fmtWhen } from "@shared/format";

export default function AdminPage() {
  useTitle("Admin");
  const q = useAdmin();
  const state = stateOf(q); // a non-admin gets a 404: the page's existence isn't revealed
  if (state) return state;
  const { reports, artists } = q.data!;

  return (
    <div className="wrap grid max-w-5xl gap-10 pt-6 md:pt-8">
      <h1 className="display display-lg">Admin</h1>

      <section>
        <SectionTitle>Open reports ({reports.length})</SectionTitle>
        {reports.length === 0 ? <EmptyState title="All clear" body="No open reports." /> : (
          <ul className="grid gap-3">
            {reports.map((r) => (
              <li key={r.id} className="card p-4">
                <p className="font-mono text-xs uppercase text-muted">{r.targetKind} · {r.targetId} · {fmtWhen(r.createdAt)}</p>
                <p className="mt-1 break-words">{r.reason}</p>
                <AdminActions id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Artists</SectionTitle>
        <ul>
          {artists.map((a) => (
            <li key={a.id} className="border-b border-line py-3">
              <Link href={`/artist/${a.handle}`} className="font-medium underline underline-offset-4">{a.name}</Link>
              <span className="ml-2 font-mono text-xs uppercase text-muted">@{a.handle} · {a.status}</span>
              <ArtistAdmin id={a.id} verified={a.verified} suspended={a.status === "suspended"} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
