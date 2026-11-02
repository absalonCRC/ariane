import { t, useLocale } from '../i18n';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  modal?: boolean;
}
export function Dialog({ title, onClose, children, wide, modal }: Props) {
  useLocale();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const d = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modal) d.showModal();
    else d.show();
    const initial = d.querySelector<HTMLElement>(
      'input:not([type="checkbox"]):not([type="radio"]), textarea, select',
    );
    initial?.focus({ preventScroll: true });
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
      if (previous?.isConnected && previous !== document.body)
        previous.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.cm-content')?.focus({ preventScroll: true });
    };
  }, [modal]);
  return (
    <dialog
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label={t('Fermer')} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="state-content">{children}</div>
    </dialog>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  useLocale();
  return <p className="empty-state">{children}</p>;
}
