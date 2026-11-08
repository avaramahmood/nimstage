import { useState, type ReactNode } from "react";
import { coverStyle } from "@shared/format";
import { imgUrl } from "@/lib/img";

/**
 * Artwork. If the artist uploaded an image it is shown; otherwise (or if it fails to load) the soft
 * gradient-mesh art generated from `seed` (pure CSS, no filter). Callers set size and rounding.
 */
export function Cover({ seed, className = "", image }: { seed: string; className?: string; image?: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = imgUrl(image);
  if (src && !failed) return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={`${className} object-cover`} />;
  return <div aria-hidden="true" className={className} style={coverStyle(seed)} />;
}

export function Eq({ paused = false }: { paused?: boolean }) {
  return (
    <span aria-hidden="true" className={`eq ${paused ? "paused" : ""}`}>
      <i />
      <i />
      <i />
    </span>
  );
}

export function LiveSticker() {
  return (
    <span className="sticker">
      <span className="live-dot" aria-hidden="true" /> Live
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="display display-md">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Scroll-driven fade+rise, done in CSS (see .reveal in globals.css). Content is visible by
 * default; browsers that support animation-timeline add the entrance, and a stagger is
 * encoded in --i. Nothing depends on JavaScript having hydrated.
 */
export function Reveal({ children, index = 0, className = "" }: { children: ReactNode; index?: number; className?: string }) {
  return (
    <div className={`reveal ${className}`} style={{ ["--i" as string]: Math.min(index, 6) }}>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-white/20 p-8 text-center">
      <p className="display display-sm">{title}</p>
      <p className="mx-auto mt-2 max-w-[36ch] text-muted">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
