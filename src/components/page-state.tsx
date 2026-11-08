import type { ReactNode } from "react";
import { Link } from "@/components/link";
import { ApiError } from "@/lib/api";
import { PageSkeleton } from "@/components/skeleton";
import { SignInPanel } from "@/components/auth";
import { useTitle } from "@/lib/use-now";

export function NotFoundView() {
  useTitle("Not found");
  return (
    <div className="wrap max-w-3xl pt-10 md:pt-16">
      <p className="label">404</p>
      <h1 className="display display-lg mt-2">Nothing here</h1>
      <p className="mt-3 text-muted">That page doesn&apos;t exist, or it was taken down.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to the stage
      </Link>
    </div>
  );
}

export function ErrorView({ retry }: { retry?: () => void }) {
  return (
    <div className="wrap max-w-3xl pt-10 md:pt-16" role="alert">
      <h1 className="display display-lg">Something went wrong</h1>
      <p className="mt-3 text-muted">We couldn&apos;t load this. Check your connection and try again.</p>
      {retry && (
        <button type="button" className="btn btn-primary mt-6" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SignInGate({ title, body }: { title: string; body: string }) {
  useTitle(title);
  return (
    <div className="wrap max-w-3xl pt-6 md:pt-8">
      <h1 className="display display-lg">{title}</h1>
      <p className="mb-4 mt-2 text-muted">{body}</p>
      <SignInPanel />
    </div>
  );
}

/**
 * Turns a query's loading / error state into something to render, or null when the data is ready.
 * 404 -> not found, 401 -> a sign-in prompt (if `gate` is given), anything else -> a retry screen.
 */
export function stateOf(q: { isPending: boolean; error: unknown; refetch: () => unknown }, gate?: { title: string; body: string }): ReactNode | null {
  if (q.isPending) return <PageSkeleton />;
  if (q.error instanceof ApiError) {
    if (q.error.status === 404) return <NotFoundView />;
    if (q.error.status === 401 && gate) return <SignInGate {...gate} />;
  }
  if (q.error) return <ErrorView retry={() => void q.refetch()} />;
  return null;
}
