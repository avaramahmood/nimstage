import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; tone: "info" | "error" | "ok" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++n.current;
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-3 z-[100] mx-auto flex max-w-[480px] flex-col gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`fade-in pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)] ${
              t.tone === "error" ? "border-danger/50 bg-surface-2 text-danger" : t.tone === "ok" ? "border-ok/50 bg-surface-2 text-ok" : "border-white/25 bg-surface-2 text-ink"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
