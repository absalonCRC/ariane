import { usePresenceValue } from './Presence';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

export interface MenuAction {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  run: () => unknown;
}
export interface MenuContent {
  title: string;
  detail?: string;
  groups: MenuAction[][];
}
interface MenuEvent {
  clientX: number;
  clientY: number;
  currentTarget: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}
type OpenMenu = (event: MenuEvent, content: MenuContent) => void;
const MenuOpenContext = createContext(false);
export const useContextMenuOpen = () => useContext(MenuOpenContext);
const MenuNoticeContext = createContext<{ message: string; clear: () => void }>({
  message: '',
  clear: () => {},
});
export const useContextMenuNotice = () => useContext(MenuNoticeContext);
const MenuContext = createContext<OpenMenu>(() => {});
export const useContextMenu = () => useContext(MenuContext);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<
    (MenuContent & { x: number; y: number; origin: HTMLElement | null }) | null
  >(null);
  const shown = usePresenceValue(menu);
  const displayed = shown.value;
  const [error, setError] = useState('');
  const clearError = useCallback(() => setError(''), []);
  const notice = useMemo(() => ({ message: error, clear: clearError }), [error, clearError]);
  const panel = useRef<HTMLDivElement>(null);
  const open = useCallback<OpenMenu>((event, content) => {
    const groups = content.groups.filter((group) => group.length);
    if (!groups.length) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const rect = target?.getBoundingClientRect();
    setMenu({
      ...content,
      groups,
      x: event.clientX || rect?.left || 8,
      y: event.clientY || rect?.bottom || 8,
      origin: target?.matches('button, input, textarea, [contenteditable="true"]')
        ? target
        : (target?.querySelector<HTMLElement>(
            'button, input, textarea, [contenteditable="true"]',
          ) ?? (document.activeElement instanceof HTMLElement ? document.activeElement : target)),
    });
  }, []);
  useEffect(() => {
    const keyboardMenu = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      if (!(event.target instanceof HTMLElement)) return;
      const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      event.target.dispatchEvent(context);
      if (context.defaultPrevented) event.preventDefault();
    };
    window.addEventListener('keydown', keyboardMenu);
    return () => window.removeEventListener('keydown', keyboardMenu);
  }, []);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!menu || !element) return;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [menu]);
  useLayoutEffect(() => {
    const origin = menu?.origin;
    if (!origin?.hasAttribute('aria-haspopup')) return;
    const previous = origin.getAttribute('aria-expanded');
    origin.setAttribute('aria-expanded', 'true');
    return () => {
      if (origin.getAttribute('aria-expanded') !== 'true') return;
      if (previous === null) origin.removeAttribute('aria-expanded');
      else origin.setAttribute('aria-expanded', previous);
    };
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const pointer = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) dismiss();
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        if (menu.origin?.isConnected) menu.origin.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  return (
    <MenuOpenContext.Provider value={!!displayed}>
      <MenuContext.Provider value={open}>
        <MenuNoticeContext.Provider value={notice}>
          {children}
          {displayed &&
            createPortal(
              <div
                ref={panel}
                className="context-menu"
                role="menu"
                aria-label={displayed.title}
                data-phase={shown.exiting ? 'exit' : 'open'}
                inert={shown.exiting}
                aria-hidden={shown.exiting || undefined}
                style={{ left: displayed.x, top: displayed.y }}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  const buttons = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                  ];
                  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === 'ArrowDown'
                      ? (index + 1) % buttons.length
                      : event.key === 'ArrowUp'
                        ? (index - 1 + buttons.length) % buttons.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? buttons.length - 1
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    event.stopPropagation();
                    buttons[next]?.focus();
                  }
                }}
              >
                <div className="context-menu-heading" role="presentation">
                  <strong>{displayed.title}</strong>
                  {displayed.detail && <span>{displayed.detail}</span>}
                </div>
                {displayed.groups.map((group, index) => (
                  <div role="group" key={index}>
                    {index > 0 && <div className="context-menu-separator" role="separator" />}
                    {group.map(({ label, icon: Icon, shortcut, run }) => (
                      <button
                        key={label}
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                          if (shown.exiting) return;
                          setMenu(null);
                          if (displayed.origin?.isConnected)
                            displayed.origin.focus({ preventScroll: true });
                          try {
                            Promise.resolve(run()).catch(() =>
                              setError(
                                'Cette action n’a pas pu aboutir. Vérifiez notamment l’accès au presse-papiers.',
                              ),
                            );
                          } catch {
                            setError('Cette action n’a pas pu aboutir.');
                          }
                        }}
                      >
                        <span className="context-menu-icon" aria-hidden="true">
                          {Icon && <Icon size={14} />}
                        </span>
                        <span>{label}</span>
                        {shortcut && <kbd>{shortcut}</kbd>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>,
              document.body,
            )}
        </MenuNoticeContext.Provider>
      </MenuContext.Provider>
    </MenuOpenContext.Provider>
  );
}
