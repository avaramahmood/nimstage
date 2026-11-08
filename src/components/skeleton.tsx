export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** Shown while a page's code or data is loading. Keeps the layout stable so nothing jumps. */
export function PageSkeleton() {
  return (
    <div className="wrap grid gap-6 pt-6 md:pt-8" role="status" aria-label="Loading">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
