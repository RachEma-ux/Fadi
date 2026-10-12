import { useEffect, useRef, type ReactNode } from "react";

/** Native modal: trapped focus, Escape, inert background and focus restored to the invoking control. */
export function Dialog({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`fadi-dialog ${className}`} aria-label={title} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } }} onCancel={(e) => { e.preventDefault(); closeRef.current(); }}>
    <header className="fadi-dialog-head"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
    {children}
  </dialog>;
}
