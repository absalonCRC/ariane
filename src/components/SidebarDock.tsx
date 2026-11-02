import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  const dock = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const actions = dock.current?.querySelector('.binder-footer-project');
    if (!expanded && actions?.contains(document.activeElement))
      dock.current?.querySelector<HTMLButtonElement>('.theme-switcher')?.focus();
  }, [expanded]);
  return (
    <nav
      ref={dock}
      className="binder-footer"
      data-expanded={expanded}
      aria-label="Accès du projet"
      inert={busy}
    >
      <div className="binder-footer-actions">
        {onToggleTheme && (
          <span className="binder-footer-theme">
            <ThemeSwitcher dark={dark} onChange={onToggleTheme} />
          </span>
        )}
        <div
          ref={onActionsHost}
          className="binder-footer-project"
          inert={!expanded}
          aria-hidden={!expanded || undefined}
        >
          {children}
        </div>
      </div>
    </nav>
  );
}
