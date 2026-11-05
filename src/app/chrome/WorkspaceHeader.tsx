import type { Command } from '../Palette';
import type { Dispatch, SetStateAction } from 'react';
import { t } from '../../i18n';
import { MoreHorizontal, Focus, Minimize2, History } from 'lucide-react';
import { ArianeWordmark } from '../../components/ArianeWordmark';
interface Props {
  libraryBusy: boolean;
  binder: boolean;
  historyMode: boolean;
  immersiveFocus: boolean | undefined;
  onToggleFocus: () => void;
  onResume: () => void;
  resumeOpen: boolean;
  menu: boolean;
  setMenu: Dispatch<SetStateAction<boolean>>;
  commands: Command[];
}
export function WorkspaceHeader({
  libraryBusy,
  binder,
  historyMode,
  immersiveFocus,
  onToggleFocus,
  onResume,
  resumeOpen,
  menu,
  setMenu,
  commands,
}: Props) {
  return (
    <header className="app-header" inert={libraryBusy}>
      <ArianeWordmark compact={!binder} />
      <div className="header-right">
        {!historyMode && (
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
        {!historyMode && (
          <button
            className="resume-trigger"
            aria-label={t('Reprendre le fil')}
            data-tooltip={t('Reprendre le fil')}
            aria-expanded={resumeOpen}
            onClick={onResume}
          >
            <History size={16} aria-hidden="true" />
          </button>
        )}
        <div className="menu-control" data-open={menu}>
          <button
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
                  key={c.label}
                  onClick={() => {
                    setMenu(false);
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
