import { localizeMessage, t, useLocale } from '../i18n';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Check, CircleAlert, FileText, Folder, Info, Plus, X } from 'lucide-react';
import type { Project, Section } from '../contracts/project';
import { sectionPath } from './tree';
export type PathNotification = {
  id: number;
  message: string;
  tone: 'success' | 'info' | 'error';
  action?: { label: string; onClick: () => void; disabled?: boolean };
  showDetails?: boolean;
  onDismiss: () => void;
};

function NoticeLabel({ notice }: { notice: PathNotification }) {
  useLocale();
  return (
    <>
      {notice.tone === 'error' ? (
        <CircleAlert size={14} aria-hidden="true" />
      ) : notice.tone === 'success' ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Info size={14} aria-hidden="true" />
      )}
      <span className="path-title-text">{localizeMessage(notice.message)}</span>
    </>
  );
}

function NoticeActions({
  notice,
  onDetails,
  returnFocus,
}: {
  notice: PathNotification;
  onDetails: () => void;
  returnFocus: () => void;
}) {
  useLocale();
  const actions = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = actions.current;
    return () => {
      if (element?.contains(document.activeElement)) returnFocus();
    };
  }, [returnFocus]);
  return (
    <span className="path-notice-actions" ref={actions}>
      {notice.action && (
        <button disabled={notice.action.disabled} onClick={notice.action.onClick}>
          {notice.action.label}
        </button>
      )}
      {notice.showDetails && <button onClick={onDetails}>{t('Détails')}</button>}
      <button
        className="title-notice-close"
        aria-label={t('Fermer la notification')}
        onClick={notice.onDismiss}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </span>
  );
}

export function PathMenu({
  project,
  selected,
  continuous,
  onSelect,
  onAdd,
  notifications = [],
  hasPending = false,
  hasError = false,
  noticeDetails,
}: {
  project: Project;
  selected: Section | undefined;
  continuous: boolean;
  onSelect: (id: string) => void;
  onAdd: (parent: string | null) => void;
  notifications?: PathNotification[];
  hasPending?: boolean;
  hasError?: boolean;
  noticeDetails?: ReactNode;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [headingSize, setHeadingSize] = useState<{ width: number; height: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleWidth = useRef(0);
  const returnFocus = useCallback(() => trigger.current?.focus({ preventScroll: true }), []);
  const primary = notifications[0];
  const signature = notifications.map((notice) => notice.id).join(',');
  const parent = continuous
    ? null
    : selected?.kind === 'scene'
      ? selected.parent
      : selected?.id || null;
  const path = continuous ? [] : sectionPath(project.sections, selected);
  const title = [
    project.name,
    ...(continuous
      ? [t('Manuscrit entier')]
      : path.map((section) => section.title || t('Sans titre'))),
  ].join(' / ');

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0) return;
      if (!primary) titleWidth.current = width;
      const limit = Math.max(0, Math.min(620, window.innerWidth - 180));
      const next = {
        width: primary ? Math.min(limit, Math.max(width, titleWidth.current + 64, 320)) : width,
        height: Math.min(height, Math.max(28, Math.min(240, window.innerHeight - 50))),
      };
      setHeadingSize((previous) =>
        previous?.width === next.width && previous.height === next.height ? previous : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [signature, title, hasPending, !!primary]);

  function nodes(): ReactNode {
    return path.map((section, depth) => (
      <button
        key={section.id}
        className="path-tree-item"
        style={{ paddingLeft: 12 + Math.min(depth + 1, 8) * 14 }}
        aria-current={selected?.id === section.id ? 'page' : undefined}
        onClick={() => {
          setOpen(false);
          onSelect(section.id);
        }}
      >
        {section.kind === 'scene' ? <FileText size={14} /> : <Folder size={14} />}
        <span>{section.title || t('Sans titre')}</span>
      </button>
    ));
  }
  return (
    <div
      className="path-menu"
      data-open={open}
      data-notifying={!!primary}
      style={{ '--path-heading-height': (headingSize?.height ?? 28) + 'px' } as CSSProperties}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="false">
        {notifications
          .filter((notice) => notice.tone !== 'error')
          .map((notice) => (
            <span key={notice.id}>{localizeMessage(notice.message)} </span>
          ))}
      </span>
      <span className="sr-only" aria-live="assertive" aria-atomic="false">
        {notifications
          .filter((notice) => notice.tone === 'error')
          .map((notice) => (
            <span key={notice.id}>{localizeMessage(notice.message)} </span>
          ))}
      </span>
      <div
        className="path-heading"
        data-notifying={!!primary}
        style={headingSize ? { width: headingSize.width, height: headingSize.height } : undefined}
      >
        <div className="path-heading-content" ref={content}>
          <div className="path-notice-row" data-tone={primary?.tone}>
            <button
              className="path-trigger"
              ref={trigger}
              aria-label={
                primary
                  ? t('Arborescence du projet · ') + primary.message
                  : hasPending
                    ? t('Arborescence du projet · notifications à consulter')
                    : t('Arborescence du projet')
              }
              aria-expanded={open}
              aria-controls="path-tree"
              onClick={(event) => setOpen(event.detail === 0 ? !open : true)}
            >
              {primary ? (
                <NoticeLabel notice={primary} />
              ) : (
                <span className="path-title-text">{title}</span>
              )}
              {hasPending && !primary && (
                <span className="path-notice-dot" data-error={hasError} aria-hidden="true" />
              )}
            </button>
            {primary && (
              <NoticeActions
                key={primary.id}
                notice={primary}
                onDetails={() => setOpen(true)}
                returnFocus={returnFocus}
              />
            )}
          </div>
          {notifications.slice(1).map((notice) => (
            <div className="path-notice-row" data-tone={notice.tone} key={notice.id}>
              <div className="path-notice-extra">
                <NoticeLabel notice={notice} />
              </div>
              <NoticeActions
                notice={notice}
                onDetails={() => setOpen(true)}
                returnFocus={returnFocus}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="path-popover" id="path-tree" aria-hidden={!open} inert={!open}>
        <nav aria-label={t('Hiérarchie de la page courante')}>
          <div className="path-tree-root">
            <Folder size={14} />
            <span>{project.name}</span>
          </div>
          {nodes()}
          {continuous && (
            <div className="path-tree-root path-tree-manuscript">
              <FileText size={14} />
              <span>{t('Manuscrit entier')}</span>
            </div>
          )}
        </nav>
        <button
          className="path-add"
          onClick={() => {
            setOpen(false);
            onAdd(parent);
          }}
        >
          <Plus size={14} /> {t('Nouvelle page')}
        </button>
        {hasPending && (
          <div className="path-notices" aria-label={t('Notifications à consulter')}>
            {noticeDetails}
          </div>
        )}
      </div>
    </div>
  );
}
