import type { ReactNode } from "react";
import { Link } from "@/components/link";
import { useTitle } from "@/lib/use-now";

const MORE: [string, string][] = [
  ["/about", "About"],
  ["/help", "Help"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/policy", "Content & rights"],
];

/** A plain reading page: heading, a short summary, then titled sections. */
export function InfoPage({ title, summary, updated, children }: { title: string; summary?: string; updated?: string; children: ReactNode }) {
  useTitle(title);
  return (
    <article className="wrap pt-6">
      <h1 className="display display-lg">{title}</h1>
      {summary && <p className="mt-3 text-lg text-muted">{summary}</p>}
      <div className="mt-6 grid gap-6 text-muted">{children}</div>
      {updated && <p className="mt-8 text-sm text-muted">Last updated {updated}.</p>}
      <nav aria-label="More about NimStage" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
        {MORE.map(([href, label]) => (
          <Link key={href} href={href} className="underline underline-offset-4">
            {label}
          </Link>
        ))}
      </nav>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="display display-sm text-ink">{title}</h2>
      <div className="mt-1 grid gap-2">{children}</div>
    </section>
  );
}
