import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
export function WorkspaceScreen({
  title,
  subtitle,
  onClose,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      const destination = previous?.isConnected
        ? previous
        : document.querySelector<HTMLElement>('.cm-content');
      destination?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={'workspace-screen ' + className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="workspace-screen-header">
        <button onClick={onClose} className="workspace-return">
          <ArrowLeft size={16} />
          Revenir au texte
        </button>
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      {children}
    </dialog>
  );
}
