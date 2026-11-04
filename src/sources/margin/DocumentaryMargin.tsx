import type { PanelOrigin } from '../../components/useSharedPanel';
import type { OpenMenu } from '../../components/ContextMenu';
import type { Surface } from '../../app/workspace/types';
import type { Dispatch, SetStateAction } from 'react';
import { entityTint } from '../../enrichment/entityTypes';
import { t } from '../../i18n';
import { panelOrigin } from '../../components/useSharedPanel';
import { X } from 'lucide-react';
import type { Source } from '../../contracts/sources';
import { sourceContext } from '../contextMenu';
import type { Settings } from '../../contracts/settings';
interface Props {
  setRailScroll: Dispatch<SetStateAction<number>>;
  sourcePresence: {
    value: { id: string; top: number; sources: Source[] }[] | null;
    exiting: boolean;
  };
  workspaceMarginBounds: { top: number; bottom: number; right: number } | undefined;
  railLeft: number;
  railWidth: number;
  railGroups: { top: number; height: number; id: number | string; sources: Source[] }[];
  groupOpen: string | number | null;
  colors: Settings['entityColors'];
  cardPresence: {
    value: { source: Source; top: number; origin?: PanelOrigin } | null;
    exiting: boolean;
  };
  expandedHeight: number;
  openMenu: OpenMenu;
  read: (s: Source) => Promise<void>;
  cite: (s: Source, text: string) => Promise<void>;
  card: { source: Source; top: number; origin?: PanelOrigin } | null;
  setSurface: (value: Surface) => void;
  setCard: Dispatch<SetStateAction<{ source: Source; top: number; origin?: PanelOrigin } | null>>;
  associated: Set<string>;
  marginPins: {
    sources: Source[];
    busy: boolean;
    error: string;
    pin: (source: Source) => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
  };
  setGroupOpen: Dispatch<SetStateAction<string | number | null>>;
  hasSuggestion: boolean;
  contextTop: number | null;
  railScroll: number;
  suggestionExcerpt: string;
}
export function DocumentaryMargin({
  setRailScroll,
  sourcePresence,
  workspaceMarginBounds,
  railLeft,
  railWidth,
  railGroups,
  groupOpen,
  colors,
  cardPresence,
  expandedHeight,
  openMenu,
  read,
  cite,
  card,
  setSurface,
  setCard,
  associated,
  marginPins,
  setGroupOpen,
  hasSuggestion,
  contextTop,
  railScroll,
  suggestionExcerpt,
}: Props) {
  return (
    <div
      className="source-margin"
      aria-label={t('Sources dans la marge')}
      onScroll={(event) => setRailScroll(event.currentTarget.scrollTop)}
      data-phase={sourcePresence.exiting ? 'exit' : 'open'}
      inert={sourcePresence.exiting}
      aria-hidden={sourcePresence.exiting || undefined}
      style={
        workspaceMarginBounds
          ? {
              left: railLeft,
              width: railWidth,
              top: workspaceMarginBounds.top,
              height: Math.max(0, workspaceMarginBounds.bottom - workspaceMarginBounds.top),
              bottom: 'auto',
            }
          : { visibility: 'hidden' }
      }
    >
      {railGroups.map((g) => (
        <div
          className="source-group"
          data-anchor-line={g.id}
          data-expanded={groupOpen === g.id}
          key={g.id}
          style={{ top: g.top - (workspaceMarginBounds?.top ?? 0) }}
        >
          {g.sources.slice(0, groupOpen === g.id ? g.sources.length : 2).map((s) => (
            <div key={s.id} className="margin-source-item" data-pinned={g.id === 'pinned'}>
              <button
                className="source-label entity-tinted"
                style={{
                  ...entityTint(s.kind, colors),
                  ...(cardPresence.value?.source.id === s.id
                    ? { height: expandedHeight, minHeight: expandedHeight }
                    : {}),
                }}
                key={s.id}
                onContextMenu={(event) =>
                  openMenu(
                    event,
                    sourceContext(s, {
                      onRead: () => read(s),
                      onCite: (quote) => cite(s, quote),
                    }),
                  )
                }
                data-expanded={card?.source.id === s.id}
                onClick={(event) => {
                  setSurface('none');
                  setCard({
                    source: s,
                    top: g.top,
                    origin: panelOrigin(event.currentTarget, s.title),
                  });
                }}
              >
                <span>{s.title}</span>
                <small>
                  {t(s.kind)} ·{' '}
                  {g.id === 'pinned'
                    ? t('Ajoutée à la marge')
                    : associated.has(s.id)
                      ? t('associée à cette section')
                      : s.score === 100
                        ? t('mention détectée')
                        : s.score === 80 || s.score === 40
                          ? t('lien entre sources')
                          : 'suggestion'}
                </small>
              </button>
              {g.id === 'pinned' && (
                <button
                  className="margin-unpin icon-button"
                  aria-label={t('Retirer {0} de la marge', { 0: s.title })}
                  onClick={() => void marginPins.remove(s.id)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {g.sources.length > 2 && (
            <button
              className="more-sources"
              aria-expanded={groupOpen === g.id}
              aria-label={
                groupOpen === g.id
                  ? t('Réduire les sources')
                  : t('Afficher les {0} autres sources', { 0: g.sources.length - 2 })
              }
              onClick={() => setGroupOpen(groupOpen === g.id ? null : g.id)}
            >
              {groupOpen === g.id ? t('Réduire') : '+' + (g.sources.length - 2)}
            </button>
          )}
        </div>
      ))}
      {hasSuggestion && contextTop !== null && (
        <div
          aria-hidden="true"
          className="margin-scroll-end"
          style={{
            top: contextTop + railScroll - (workspaceMarginBounds?.top ?? 0),
            height: suggestionExcerpt ? 145 : 100,
          }}
        />
      )}
    </div>
  );
}
