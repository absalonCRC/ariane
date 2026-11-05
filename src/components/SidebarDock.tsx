import { t, useLocale } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';

export function SidebarDock({
  expanded,
  dark,
  onToggleTheme,
  busy = false,
  onActionsHost,
  children,
}: {
  expanded: boolean;
  dark: boolean;
  onToggleTheme?: () => void;
  busy?: boolean;
  onActionsHost?: (element: HTMLDivElement | null) => void;
  children?: ReactNode;
}) {
  useLocale();
  const dock = useRef<HTMLElement>(null);
  const [peek, setPeek] = useState(false);
  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = expanded || peek;
  const clearOpening = () => {
    if (opening.current !== null) clearTimeout(opening.current);
    opening.current = null;
  };
  const clearClosing = () => {
    if (closing.current !== null) clearTimeout(closing.current);
    closing.current = null;
  };
  const collapse = () => {
    clearOpening();
    clearClosing();
    setPeek(false);
    const actions = dock.current?.querySelector('.binder-footer-project');
    if (actions?.contains(document.activeElement))
      dock.current
        ?.querySelector<HTMLButtonElement>('.theme-switcher')
        ?.focus({ preventScroll: true });
  };
  const leave = () => {
    clearOpening();
    clearClosing();
    if (
      expanded ||
      (dock.current?.contains(document.activeElement) &&
        document.activeElement?.matches(':focus-visible'))
    )
      return;
    closing.current = setTimeout(collapse, 150);
  };
  useEffect(
    () => () => {
      clearOpening();
      clearClosing();
    },
    [],
  );
  useLayoutEffect(() => {
    clearOpening();
    clearClosing();
    setPeek(false);
    const actions = dock.current?.querySelector('.binder-footer-project');
    if (!expanded && actions?.contains(document.activeElement))
      dock.current?.querySelector<HTMLButtonElement>('.theme-switcher')?.focus();
  }, [expanded, busy]);
  return (
    <nav
      ref={dock}
      className="binder-footer"
      data-expanded={visible}
      data-sidebar-open={expanded}
      aria-label={t('Accès du projet')}
      inert={busy}
      onPointerEnter={clearClosing}
      onPointerLeave={leave}
      onFocusCapture={(event) => {
        clearClosing();
        if (
          !expanded &&
          !busy &&
          !event.currentTarget.contains(event.relatedTarget) &&
          event.target.matches(':focus-visible')
        ) {
          clearOpening();
          setPeek(true);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) leave();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !expanded && peek) {
          event.preventDefault();
          event.stopPropagation();
          collapse();
        }
      }}
    >
      <div className="binder-footer-actions">
        {onToggleTheme && (
          <span
            className="binder-footer-theme"
            onPointerEnter={(event) => {
              if (expanded || busy || event.pointerType === 'touch') return;
              clearOpening();
              clearClosing();
              opening.current = setTimeout(() => {
                opening.current = null;
                setPeek(true);
              }, 500);
            }}
          >
            <ThemeSwitcher dark={dark} onChange={onToggleTheme} />
          </span>
        )}
        <div
          ref={onActionsHost}
          className="binder-footer-project"
          inert={!visible}
          aria-hidden={!visible || undefined}
          onClickCapture={() => {
            if (!expanded) collapse();
          }}
        >
          {children}
        </div>
      </div>
    </nav>
  );
}
