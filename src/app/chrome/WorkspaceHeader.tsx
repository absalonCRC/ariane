import type { Command } from '../Palette';
import { useRef, type Dispatch, type SetStateAction } from 'react';
import { t } from '../../i18n';
import { MoreHorizontal, Focus, Minimize2 } from 'lucide-react';
import { ArianeWordmark } from '../../components/ArianeWordmark';
interface Props {
  libraryBusy: boolean;
  binder: boolean;
  historyMode: boolean;
  pageMode?: boolean;
  immersiveFocus: boolean | undefined;
  onToggleFocus: () => void;
  menu: boolean;
  setMenu: Dispatch<SetStateAction<boolean>>;
  commands: Command[];
}
export function WorkspaceHeader({
  libraryBusy,
  binder,
  historyMode,
  pageMode,
  immersiveFocus,
  onToggleFocus,
  menu,
  setMenu,
  commands,
}: Props) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    menuTrigger.current?.focus({ preventScroll: true });
    setMenu(false);
  }
  return (
    <header className="app-header" inert={libraryBusy}>
      <ArianeWordmark compact={!binder} hideCompact />
      <div className="header-right">
        {!historyMode && !pageMode && (
          <button
            className="focus-mode-trigger"
            aria-label={immersiveFocus ? t('Quitter le mode focus') : t('Activer le mode focus')}
            aria-pressed={!!immersiveFocus}
            aria-keyshortcuts="Meta+Shift+F"
            onClick={onToggleFocus}
          >
            {immersiveFocus ? (
              <Minimize2 size={16} aria-hidden="true" />
            ) : (
              <Focus size={16} aria-hidden="true" />
            )}
          </button>
        )}
        <div
          className="menu-control"
          data-open={menu}
          onKeyDown={(event) => {
            if (menu && event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeMenu();
            }
          }}
        >
          <button
            ref={menuTrigger}
            className="icon-button menu-trigger"
            aria-label={t('Menu du projet')}
            aria-expanded={menu}
            aria-controls="project-menu"
            onClick={() => setMenu((v) => !v)}
          >
            <MoreHorizontal size={19} />
          </button>
          <nav
            id="project-menu"
            className="project-menu floating"
            aria-label={t('Menu du projet')}
            aria-hidden={!menu}
            inert={!menu}
          >
            {commands
              .filter((c) =>
                ['export', 'sources', 'history', 'new-project', 'open-project'].includes(
                  c.id ?? '',
                ),
              )
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    closeMenu();
                    c.action();
                  }}
                >
                  {c.label}
                </button>
              ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
