import {
  useContext,
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../i18n';
import { ViewTitleCapsule } from './ViewTitleCapsule';
import { WindowDragRegion } from './WindowDragRegion';
import { ArianeWordmark } from './ArianeWordmark';
import { WorkspacePageHeading } from './WorkspacePageHeading';

/** A project owns one page outlet and one return-focus target, across page changes. */
const ScreenHost = createContext<{
  target: HTMLElement | null;
  returnFocus: RefObject<HTMLElement | null>;
  onBusy: (busy: boolean) => void;
} | null>(null);
export const WorkspaceScreenHost = ScreenHost.Provider;
export function WorkspaceScreen({
  title,
  subtitle,
  onClose,
  children,
  className = '',
  capsuleTrail,
  onError,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  capsuleTrail?: string[];
  onError: (error: unknown) => void;
  busy?: boolean;
}) {
  useLocale();
  const host = useContext(ScreenHost);
  const page = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!host?.target || !page.current) return;
    host.returnFocus.current ??=
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!page.current.contains(document.activeElement)) page.current.focus({ preventScroll: true });
  }, [host?.target]);
  useLayoutEffect(() => {
    host?.onBusy(busy);
    return () => host?.onBusy(false);
  }, [host?.onBusy, busy]);
  useEffect(() => {
    if (host) return;
    const element = dialog.current!,
      previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      const destination = previous?.isConnected
        ? previous
        : document.querySelector<HTMLElement>('.cm-content');
      destination?.focus({ preventScroll: true });
    };
  }, [!!host]);
  const content = (
    <>
      <WorkspacePageHeading title={title} subtitle={subtitle} onClose={onClose} busy={busy} />
      {children}
    </>
  );
  if (host)
    return host.target
      ? createPortal(
          <section
            ref={page}
            aria-label={title}
            tabIndex={-1}
            className={'workspace-screen workspace-page ' + className}
            onKeyDown={(event) => {
              if (
                event.key !== 'Escape' ||
                event.defaultPrevented ||
                event.nativeEvent.isComposing ||
                (event.target as HTMLElement).closest('dialog[open]')
              )
                return;
              event.stopPropagation();
              if ((event.target as HTMLElement).closest('select')) return;
              event.preventDefault();
              if (!busy) onClose();
            }}
          >
            {content}
          </section>,
          host.target,
        )
      : null;
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className={'workspace-screen ' + className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <WindowDragRegion onError={onError} />
      <ArianeWordmark />
      <ViewTitleCapsule view={{ title, trail: capsuleTrail, onBack: onClose }} />
      {content}
    </dialog>
  );
}
