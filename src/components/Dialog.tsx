import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}
export function Dialog({ title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const d = ref.current!;
    d.show();
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        !d.open ||
        d.closest('[data-phase="exit"]')
      )
        return;
      const dialogs = [...document.querySelectorAll('dialog[open]')].filter(
        (dialog) => !dialog.closest('[data-phase="exit"]'),
      );
      if (dialogs[dialogs.length - 1] !== d) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      if (d.open) d.close();
    };
  }, []);
  return (
    <dialog ref={ref} className={wide ? 'dialog wide' : 'dialog'}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="state-content" key={title}>
        {children}
      </div>
    </dialog>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
