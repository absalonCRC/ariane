import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
  removeAssignment,
  enterTagFilter,
}: FilterInput) {
  const [queryFilter, setQueryFilter] = useState<{
    path: string;
    query: StructuredQuery;
    name?: string;
  } | null>(null);
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
  const [tagFilter, setTagFilter] = useState<{ project: string; id: string } | null>(null);
  const [tagViewMode, setTagViewMode] = useState<'text' | 'table'>('text');
  useEffect(() => setTagViewMode('text'), [project?.path]);
  const singleTag =
    project?.path === tagFilter?.project
      ? project?.smartTags?.find((tag) => tag.id === tagFilter?.id)
      : undefined;
  const structuredFilter = queryFilter?.path === project?.path ? queryFilter : null;
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
    if (tagFilter && !singleTag) setTagFilter(null);
  }, [tagFilter, singleTag]);
  const filterSection = useRef(active);
  useEffect(() => {
    if (filterSection.current !== active) {
      setTagFilter(null);
      setQueryFilter(null);
    }
    filterSection.current = active;
  }, [active]);
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
