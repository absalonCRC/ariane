import type { OpenMenu } from '../components/ContextMenu';
import type { Surface } from '../app/workspace/types';
import type { RefObject } from 'react';
import type { EditorHandle } from '../editor/Editor';
import { entityTint } from './entityTypes';
import { t } from '../i18n';
import { plainExcerpt } from './excerpts';
import { panelOrigin } from '../components/useSharedPanel';
import { Copy, ArrowUpRight, X } from 'lucide-react';
import type { Settings } from '../contracts/settings';
import type { MemoryController } from './useMemory';
interface Props {
  contextTop: number;
  railLeft: number;
  railWidth: number;
  memory: MemoryController;
  openMenu: OpenMenu;
  setSurface: (value: Surface) => void;
  suggestionExcerpt: string;
  colors: Settings['entityColors'];
  suggestionTitle: string;
  fail: (e: unknown) => void;
  editor: RefObject<EditorHandle | null>;
}
export function MemorySuggestion({
  contextTop,
  railLeft,
  railWidth,
  memory,
  openMenu,
  setSurface,
  suggestionExcerpt,
  colors,
  suggestionTitle,
  fail,
  editor,
}: Props) {
  return (
    <div
      className="memory-suggestion"
      style={{ top: contextTop!, left: railLeft, width: railWidth }}
    >
      <button
        onContextMenu={(event) => {
          const suggestion = memory.suggestion!;
          openMenu(event, {
            title: suggestion.kind === 'entity' ? t('Fiche du manuscrit') : t('Passage suggéré'),
            groups: [
              [
                {
                  label: suggestion.kind === 'entity' ? t('Ouvrir la fiche') : t('Voir le passage'),
                  icon: ArrowUpRight,
                  run: () => {
                    setSurface('none');
                    memory.open(suggestion);
                  },
                },
                ...(suggestionExcerpt && typeof navigator.clipboard?.writeText === 'function'
                  ? [
                      {
                        label: t('Copier l’extrait'),
                        icon: Copy,
                        run: () => navigator.clipboard.writeText(suggestionExcerpt),
                      },
                    ]
                  : []),
              ],
            ],
          });
        }}
        className={`source-label memory-context${memory.suggestion!.kind === 'entity' ? ' entity-tinted' : ''}`}
        style={
          memory.suggestion!.kind === 'entity'
            ? entityTint(memory.result?.entities[0]?.kind ?? 'Note', colors)
            : undefined
        }
        onClick={(event) => {
          setSurface('none');
          memory.open(memory.suggestion!, panelOrigin(event.currentTarget, suggestionTitle));
        }}
      >
        <span>{suggestionTitle}</span>
        <small>
          {memory.suggestion!.kind === 'entity'
            ? t('Depuis votre texte')
            : memory.suggestion!.kind === 'evidence'
              ? t('Passage à confronter')
              : t('Dans votre manuscrit')}
        </small>
        {suggestionExcerpt && (
          <span className="suggestion-excerpt">{plainExcerpt(suggestionExcerpt)}</span>
        )}
      </button>
      {memory.suggestion!.kind !== 'entity' && (
        <button
          className="dismiss-suggestion"
          aria-label={t('Masquer ce rapprochement')}
          data-hint={t('Masquer ce rapprochement')}
          onClick={() => {
            void memory.dismiss().catch(fail);
            editor.current?.focus();
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
