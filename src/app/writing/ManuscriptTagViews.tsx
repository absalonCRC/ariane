import type { RefObject } from 'react';
import type { Project } from '../../contracts/project';
import type { EntityBatch } from '../../contracts/entities';
import type { EditorHandle } from '../../editor/types';
import { t } from '../../i18n';
import { OutlineDetails } from '../../tags/OutlineDetails';
import { TagFilterView } from '../../tags/TagFilterView';
import { lineReferenceSection } from '../../tags/properties';
import type { ManuscriptFilters } from './useManuscriptFilters';

interface TagViewProps {
  project: Project;
  batches: EntityBatch[];
  filters: ManuscriptFilters;
  locatePassage: (section: string, node: string | null, quote: string) => Promise<void>;
  read: (id: string, beforeOpen?: () => void) => Promise<void>;
  fail: (error: unknown) => void;
}
export function FilteredManuscript({
  project: p,
  batches,
  filters,
  locatePassage,
  read,
  fail,
  projectRef,
}: TagViewProps & { projectRef: RefObject<Project | null> }) {
  const { filteredTag, openTagFilter, removeTagAssignment, tagRemovalLabel } = filters;
  const {
    structuredFilter,
    tagViewMode,
    filterPassages,
    queryLabelText,
    queryError,
    ambiguous,
    pendingAnalysis,
    setTagFilter,
    setQueryFilter,
    closeTagFilter,
  } = filters;
  if (!filteredTag) return null;
  return (
    <TagFilterView
      key={p.path + ':' + filteredTag.id}
      project={p}
      tag={filteredTag}
      heading={
        structuredFilter
          ? (structuredFilter.name ?? queryLabelText ?? t('Recherche structurée'))
          : undefined
      }
      notice={
        structuredFilter && (queryError || ambiguous > 0 || pendingAnalysis > 0)
          ? queryError ||
            (ambiguous
              ? t('Des mentions homonymes restent à résoudre : {0}', { 0: ambiguous })
              : t('Mentions en attente d’actualisation'))
          : undefined
      }
      mode={tagViewMode}
      passages={filterPassages}
      batches={batches}
      onTag={openTagFilter}
      onRemove={structuredFilter ? undefined : removeTagAssignment}
      removalLabel={tagRemovalLabel}
      onError={fail}
      onRelation={(relation) => {
        if (relation.kind === 'line') {
          setTagFilter(null);
          const section = lineReferenceSection(p, relation.section, relation.node);
          if (section) void locatePassage(section, relation.node, relation.title);
          else fail(t('La ligne liée n’est plus disponible.'));
        } else void read(relation.id, () => setTagFilter(null));
      }}
      onClose={closeTagFilter}
      onOpen={(passage) => {
        const live = projectRef.current;
        const original =
          live?.path === p.path
            ? live.sections.find((s) => s.id === passage.section && !s.trashed)
            : undefined;
        if (
          !original ||
          (passage.node && !original.outline?.nodes.some((n) => n.id === passage.node))
        ) {
          fail(t('La ligne liée n’est plus disponible.'));
          return;
        }
        setTagFilter(null);
        setQueryFilter(null);
        requestAnimationFrame(
          () => void locatePassage(passage.section, passage.node, passage.text),
        );
      }}
    />
  );
}
export function ManuscriptLineDetails({
  project: p,
  batches,
  filters,
  locatePassage,
  read,
  fail,
  editor,
  onManage,
}: TagViewProps & { editor: RefObject<EditorHandle | null>; onManage: () => void }) {
  const {
    lineDetail,
    lineDetailVisible,
    setLineDetail,
    openTagFilter,
    removeTagAssignment,
    tagRemovalLabel,
    filteredTag,
  } = filters;
  if (!lineDetailVisible || !lineDetail || filteredTag) return null;
  return (
    <OutlineDetails
      project={p}
      section={lineDetail.section}
      node={lineDetail.node}
      batches={batches}
      onChange={(field, value) => {
        if (editor.current?.setLineProperty(lineDetail.section, lineDetail.node, field, value))
          setLineDetail((current) => (current ? { ...current } : current));
      }}
      onClose={() => {
        setLineDetail(null);
        editor.current?.focus();
      }}
      onManage={onManage}
      onRemove={removeTagAssignment}
      removalLabel={tagRemovalLabel}
      onError={fail}
      onFilter={openTagFilter}
      onOpen={(relation) => {
        setLineDetail(null);
        if (relation.kind === 'line') {
          const section = lineReferenceSection(p, relation.section, relation.node);
          if (section) void locatePassage(section, relation.node, relation.title);
          else fail(t('La ligne liée n’est plus disponible.'));
        } else void read(relation.id);
      }}
    />
  );
}
