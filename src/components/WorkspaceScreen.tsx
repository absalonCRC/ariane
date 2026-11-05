import { t, useLocale } from '../i18n';
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ViewTitleCapsule } from './ViewTitleCapsule';
import { WindowDragRegion } from './WindowDragRegion';
export function WorkspaceScreen({
  title,
  subtitle,
  onClose,
  children,
  className = '',
  capsuleTrail,
  onError,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  capsuleTrail?: string[];
  onError: (error: unknown) => void;
}) {
  useLocale();
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
      <WindowDragRegion onError={onError} />
      <ViewTitleCapsule view={{ title, trail: capsuleTrail, onBack: onClose }} />
      <header className="workspace-screen-header">
        <button onClick={onClose} className="workspace-return">
          <ArrowLeft size={16} />
          {t('Revenir au texte')}
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
