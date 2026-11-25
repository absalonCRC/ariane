import { useEffect, useLayoutEffect, useState, type ComponentProps } from 'react';
import type { Project } from '../../contracts/project';
import type { Source } from '../../contracts/sources';
import type { MemoryController } from '../../enrichment/useMemory';
import { usePresenceValue } from '../../components/Presence';
import type { NoteActivityController } from '../../notes/useNoteActivity';
import { request } from '../../platform/client';
import { t } from '../../i18n';
import { marginLayout } from '../marginLayout';
import { useMarginPins } from '../useMarginPins';
import type { DocumentaryMargin } from './DocumentaryMargin';

type MarginProps = ComponentProps<typeof DocumentaryMargin>;
interface RailInput extends Pick<MarginProps, 'card' | 'groupOpen' | 'setGroupOpen'> {
  project: Project | null;
  active: string | null;
  continuous: boolean;
  pinSection: string | undefined;
  activity: Pick<NoteActivityController, 'record'>;
  bounds: MarginProps['workspaceMarginBounds'];
  groups: NonNullable<MarginProps['sourcePresence']['value']>;
  annotationsOpen: boolean;
  memory: Pick<MemoryController, 'top' | 'suggestion' | 'result'>;
}
export function useDocumentaryRail({
  project,
  active,
  continuous,
  pinSection,
  card,
  groupOpen,
  setGroupOpen,
  activity,
  bounds,
  groups,
  memory,
  annotationsOpen,
}: RailInput) {
  const [associated, setAssociated] = useState<Set<string>>(new Set());
  const [associationVersion, setAssociationVersion] = useState(0);
  const marginPins = useMarginPins(project?.path, pinSection, associationVersion, activity);
  const pinIds = new Set(marginPins.sources.map((s) => s.id));
  const pinSource = (source: Source) =>
    void marginPins.pin(source).then((added) => {
      if (added) setGroupOpen('pinned');
    });
  const marginPinFor = (source: Source) => ({
    canPin: !!pinSection,
    busy: marginPins.busy,
    pinned: pinIds.has(source.id),
    error: marginPins.error,
    onPin: () => pinSource(source),
  });
  const visibleGroups = [
    ...(marginPins.sources.length
      ? [{ id: 'pinned', top: bounds?.top ?? 55, sources: marginPins.sources }]
      : []),
    ...groups
      .map((g) => ({ ...g, sources: g.sources.filter((s) => !pinIds.has(s.id)) }))
      .filter((g) => g.sources.length),
  ];
  const sourcePresence = usePresenceValue(visibleGroups.length ? visibleGroups : null);
  const cardPresence = usePresenceValue(card);
  const [expandedHeight, setExpandedHeight] = useState(400);
  const [groupHeights, setGroupHeights] = useState(() => new Map<string, number>());
  const [railScroll, setRailScroll] = useState(0);
  useLayoutEffect(() => {
    if (!card) return;
    const panel = document.querySelector<HTMLElement>('.source-card');
    if (!panel) return;
    const measure = () => setExpandedHeight(Math.max(54, panel.offsetHeight));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(panel);
    return () => observer?.disconnect();
  }, [card?.source.id]);
  const railGroups = marginLayout(
    sourcePresence.value ?? [],
    groupOpen,
    cardPresence.value?.source.id,
    expandedHeight,
    groupHeights,
  );

  useEffect(() => {
    let alive = true;
    setAssociated(new Set());
    if (project && active && !continuous) {
      void request('links', { section: active })
        .then((links) => {
          if (alive) setAssociated(new Set(links.map((source) => source.id)));
        })
        .catch(() => {
          /* Association status is unknown when links cannot be loaded. */
        });
    }
    return () => {
      alive = false;
    };
  }, [project?.path, active, continuous, associationVersion]);
  const contextTop =
    memory.top === null
      ? null
      : Math.max(memory.top, ...railGroups.map((g) => g.top + g.height + 36)) - railScroll;
  const recallSection =
    memory.suggestion?.kind === 'recall' ? memory.suggestion.passage.section : null;
  const suggestionExcerpt =
    memory.suggestion?.kind === 'recall'
      ? memory.suggestion.passage.quote
      : memory.suggestion?.kind === 'evidence'
        ? memory.suggestion.evidence.quote
        : '';
  const suggestionTitle =
    memory.suggestion?.kind === 'recall'
      ? project?.sections.find((section) => section.id === recallSection)?.title ||
        t('Dans votre manuscrit')
      : memory.suggestion?.kind === 'evidence'
        ? memory.suggestion.evidence.title
        : memory.result?.entities[0]?.title || t('Fiche du manuscrit');
  const railLeft = bounds ? Math.max(bounds.right + 32, innerWidth - 215) : 0;
  const railWidth = Math.max(0, Math.min(190, innerWidth - railLeft - 25));
  const railVisible = !!bounds && railWidth >= 150;
  const contextVisible =
    !annotationsOpen &&
    railVisible &&
    contextTop !== null &&
    contextTop + (suggestionExcerpt ? 125 : 80) < (bounds?.bottom ?? 0);
  return {
    railVisible,
    contextVisible,
    suggestionTitle,
    pinIds,
    pinSource,
    marginPinFor,
    marginPins,
    refreshAssociations: () => setAssociationVersion((version) => version + 1),
    layout: {
      workspaceMarginBounds: bounds,
      railLeft,
      railWidth,
      railGroups,
      sourcePresence,
      cardPresence,
      groupOpen,
      setGroupOpen,
      setGroupHeights,
      setRailScroll,
      expandedHeight,
      associated,
      marginPins,
      contextTop,
      railScroll,
      suggestionExcerpt,
    },
  };
}
