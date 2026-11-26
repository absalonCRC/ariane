import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { FilterPosition } from '../../contracts/writingSession';
import type { StructuredQuery } from '../../contracts/structuredQuery';
import type { Project } from '../../contracts/project';
import type { EntityBatch } from '../../contracts/entities';
import type { Source } from '../../contracts/sources';
import type { EntityManagerController } from '../../entities/useEntityManager';
import type { MemoryView } from '../../enrichment/useMemory';
import type { EditorHandle } from '../../editor/types';
import type { ProjectController } from '../../project/useProject';
import { measureText } from '../../editor/countMetrics';
import { localizeMessage, t } from '../../i18n';
import { evaluateQuery } from '../../search/evaluateQuery';
import { queryLabel } from '../../search/resolveQuery';
import { taggedPassages, type TagPassage } from '../../tags/passages';
import type { EffectiveTag } from '../../tags/model';

const emptyPassages: TagPassage[] = [];

interface FilterInput {
  project: Project | null;
  active: string | null;
  historyMode: boolean;
  palette: string | null;
  editor: RefObject<EditorHandle | null>;
  reader: Source | null;
  memoryView: MemoryView | null;
  annotationsOpen: boolean;
  manager: Pick<EntityManagerController, 'catalog' | 'batches' | 'sources'>;
  batches: EntityBatch[];
  stageSettings: ProjectController['stageSettings'];
  removeAssignment: ProjectController['removeTagAssignment'];
  enterTagFilter: () => void;
}
export function useManuscriptFilters({
  project,
  active,
  historyMode,
  palette,
  editor,
  reader,
  memoryView,
  annotationsOpen,
  manager,
  batches,
  stageSettings,
  removeAssignment,
  enterTagFilter,
}: FilterInput) {
  const [, rerender] = useState(0);
  const position = project?.settings.filterPosition;
  const tagViewMode = position?.mode ?? 'text';
  function save(next: FilterPosition | null) {
    if (!project) return;
    stageSettings({ filterPosition: next });
    rerender((n) => n + 1);
  }
  function setQueryFilter(next: { path: string; query: StructuredQuery; name?: string } | null) {
    if (!project) return;
    if (next?.path === project.path) save({ query: next.query, name: next.name, mode: 'text' });
    else if (project.settings.filterPosition && 'query' in project.settings.filterPosition)
      save(null);
  }
  function setTagFilter(next: { project: string; id: string } | null) {
    if (!project) return;
    if (next?.project === project.path) save({ tag: next.id, mode: 'text' });
    else if (project.settings.filterPosition && 'tag' in project.settings.filterPosition)
      save(null);
  }
  function setTagViewMode(
    change: 'text' | 'table' | ((mode: 'text' | 'table') => 'text' | 'table'),
  ) {
    if (position)
      save({ ...position, mode: typeof change === 'function' ? change(tagViewMode) : change });
  }
  const [lineDetail, setLineDetail] = useState<{
    project: string;
    section: string;
    node: string;
  } | null>(null);
  const lineDetailVisible =
    lineDetail?.project === project?.path &&
    project?.sections.some(
      (s) =>
        s.id === lineDetail?.section && s.outline?.nodes.some((n) => n.id === lineDetail?.node),
    ) &&
    !historyMode;
  useEffect(() => {
    setLineDetail(null);
  }, [project?.path, active, historyMode]);
  const tagId = position && 'tag' in position ? position.tag : null;
  const singleTag = tagId ? project?.smartTags?.find((tag) => tag.id === tagId) : undefined;
  const structuredFilter =
    project && position && 'query' in position
      ? { path: project.path, query: position.query, name: position.name }
      : null;
  let queryLabelText = '',
    queryError = '';
  let projected = emptyPassages;
  let ambiguous = 0,
    pendingAnalysis = 0;
  if (structuredFilter && project) {
    try {
      queryLabelText = queryLabel(structuredFilter.query, project.smartTags ?? [], manager.catalog);
      const evaluated = evaluateQuery(
        project,
        structuredFilter.query,
        manager.catalog,
        [
          ...batches,
          ...manager.batches.filter(
            (b) => !batches.some((l) => l.section === b.section && l.text === b.text),
          ),
        ],
        manager.sources,
      );
      projected = evaluated.passages;
      ambiguous = evaluated.ambiguous;
      pendingAnalysis = evaluated.pending;
    } catch (e) {
      queryError = localizeMessage(e);
    }
  }
  const filteredTag = structuredFilter
    ? {
        id: 'structured',
        name: structuredFilter.name ?? queryLabelText ?? t('Recherche structurée'),
        color: '#74786a',
        category: '',
      }
    : singleTag;
  const filterPassages = structuredFilter
    ? projected
    : project && singleTag
      ? taggedPassages(project, singleTag.id)
      : emptyPassages;
  const filterCounts = useMemo(() => {
    const text = filterPassages.map((passage) => passage.text).join('\n');
    return {
      ...measureText({ id: 'filter', version: 0, text }),
      lines: text ? text.split('\n').length : 0,
    };
  }, [filterPassages]);
  useEffect(() => {
    if (tagId && !singleTag) setTagFilter(null);
  }, [tagId, singleTag]);
  const location = useRef({ path: project?.path, active });
  useEffect(() => {
    if (location.current.path === project?.path && location.current.active !== active && position)
      save(null);
    location.current = { path: project?.path, active };
  }, [project?.path, active]);
  useEffect(() => {
    if (palette || historyMode) {
      setTagFilter(null);
      setQueryFilter(null);
    }
  }, [palette, historyMode]);
  const openTagFilter = (id: string) => {
    setQueryFilter(null);
    setLineDetail(null);
    if (!project) return;
    enterTagFilter();
    setTagFilter({ project: project.path, id });
  };
  const closeTagFilter = () => {
    setTagFilter(null);
    setQueryFilter(null);
    requestAnimationFrame(() => editor.current?.focus());
  };
  useEffect(() => {
    if (reader || memoryView || annotationsOpen || palette) setLineDetail(null);
  }, [reader, memoryView, annotationsOpen, palette]);
  const removeTagAssignment = async (assignment: EffectiveTag) => {
    if (
      assignment.node &&
      editor.current?.removeSmartTag(assignment.section, assignment.node, assignment.tag.id)
    ) {
      setLineDetail((current) => (current ? { ...current } : current));
      return;
    }
    await removeAssignment(assignment.section, assignment.node, assignment.tag.id);
  };
  const tagRemovalLabel = (assignment: EffectiveTag) => {
    const owner = project?.sections.find((s) => s.id === assignment.section),
      node = owner?.outline?.nodes.find((n) => n.id === assignment.node);
    const origin = node
      ? owner!.title + ' · ' + owner!.text.slice(node.start).split('\n')[0].slice(0, 60)
      : (owner?.title ?? '');
    return t('Retirer le tag {0} de {1}', { 0: assignment.tag.name, 1: origin });
  };
  return {
    lineDetail,
    setLineDetail,
    lineDetailVisible,
    setTagFilter,
    setQueryFilter,
    tagViewMode,
    setTagViewMode,
    filteredTag,
    structuredFilter,
    filterPassages,
    filterCounts,
    queryLabelText,
    queryError,
    ambiguous,
    pendingAnalysis,
    openTagFilter,
    closeTagFilter,
    removeTagAssignment,
    tagRemovalLabel,
  };
}
export type ManuscriptFilters = ReturnType<typeof useManuscriptFilters>;
