import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Cover } from "@/components/ui";
import { TicketStub } from "@/components/pay";

/*
  Depth without WebGL. Everything here is plain HTML/CSS using 3D transforms, which the browser
  composites on its own: no canvas, no shader, no JS animation loop. It works in any WebView, even
  one without GPU acceleration, and it is real DOM (selectable, readable by screen readers).
  The only JavaScript is a pointer handler that sets four CSS variables.
*/

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Tilts its content toward the pointer / finger and moves a glare highlight with it. */
export function Tilt({ children, max = 10, className = "" }: { children: ReactNode; max?: number; className?: string }) {
  const body = useRef<HTMLDivElement>(null);

  const raf = useRef(0);
  const pt = useRef({ x: 0, y: 0 });
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Pointer events can arrive faster than frames: remember the latest one and write styles once per frame.
  function move(e: PointerEvent<HTMLDivElement>) {
    if (reduceMotion()) return;
    pt.current = { x: e.clientX, y: e.clientY };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = body.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (pt.current.x - r.left) / r.width - 0.5;
      const py = (pt.current.y - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(px * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-py * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
    });
  }
  function leave() {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    const el = body.current;
    if (!el) return;
    for (const v of ["--rx", "--ry"]) el.style.setProperty(v, "0deg");
    el.style.setProperty("--gx", "30%");
    el.style.setProperty("--gy", "20%");
  }

  return (
    <div className={`tilt-stage ${className}`} onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}>
      <div ref={body} className="tilt-body">
        {children}
      </div>
    </div>
  );
}

/** A spinning record lying at an angle, with a fixed specular sheen, a thick rim and a soft shadow. */
export function Vinyl({ seed, className = "" }: { seed: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`mx-auto aspect-square w-full max-w-[460px] ${className}`}>
      <Tilt max={8} className="h-full w-full">
        <div className="float-idle h-full w-full">
          <div className="record-lay">
            <div className="record-shadow" />
            <div className="record-disc">
              <div className="record-spin">
                <Cover seed={seed} className="record-label" />
              </div>
              <div className="record-sheen" />
              <span className="record-hole" />
            </div>
          </div>
        </div>
      </Tilt>
    </div>
  );
}

/** The ticket as a floating card: tilts with the pointer, glare follows it, thick soft shadow. */
export function Ticket3D({ title, meta, price, serial, className = "" }: { title: string; meta: string; price: string; serial: string; className?: string }) {
  return (
    <Tilt max={9} className={`mx-auto w-full max-w-[460px] ${className}`}>
      <div className="float-idle ticket-float" style={{ ["--perf" as string]: "108px" } as CSSProperties}>
        <TicketStub title={title} meta={meta} price={price} serial={serial} glare />
      </div>
    </Tilt>
  );
}
