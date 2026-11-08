import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet on phones, centered modal from tablet up. Built on the native <dialog>: focus
 * trap, Esc to close and an inert background come for free, which is more reliable than a
 * hand-rolled modal in a WebView.
 */
export function Sheet({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title: string; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto h-auto max-h-[92dvh] w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-black/70 open:flex open:flex-col md:m-auto md:max-w-[540px]"
    >
      <div className="sheet-up max-h-[92dvh] overflow-y-auto rounded-t-[28px] border border-line bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 md:rounded-[28px] md:pb-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {label && <p className="label">{label}</p>}
            <h2 className="display display-md break-words">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-white/[0.04] transition-colors hover:bg-white/[0.1]">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
