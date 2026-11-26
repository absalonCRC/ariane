import type { ComponentProps, ReactNode } from 'react';
import type { Project, Section } from '../../contracts/project';
import type { EditorProps } from '../../editor/types';
import { effectiveTags } from '../../tags/model';
import type { ProjectController } from '../../project/useProject';
import type { useScrollActivity } from '../../components/useScrollActivity';
import { request } from '../../platform/client';
import type { ManuscriptFilters } from './useManuscriptFilters';
import { WritingSurface } from './WritingSurface';

type ManuscriptInput = Pick<
  EditorProps,
  | 'sections'
  | 'readOnly'
  | 'sourceVersion'
  | 'searchQuery'
  | 'focusPreview'
  | 'scrollPreview'
  | 'onVisible'
  | 'onCursor'
  | 'onEntity'
  | 'onTyping'
  | 'onSearchSources'
  | 'onOpenNote'
  | 'noteCreate'
  | 'entities'
  | 'onWritingEdit'
  | 'writingBranch'
  | 'lineHeightPreview'
  | 'onSelection'
  | 'onWords'
  | 'onLines'
  | 'onCharacters'
  | 'immersiveFocus'
>;
interface Props {
  project: Project;
  selected?: Section;
  doc: ProjectController;
  editor: ComponentProps<typeof WritingSurface>['editorRef'];
  hidden: boolean;
  filters: Pick<ManuscriptFilters, 'openTagFilter' | 'removeTagAssignment' | 'tagRemovalLabel'>;
  scrollActivity: ReturnType<typeof useScrollActivity>;
  input: ManuscriptInput;
  onOutlineDetails: (section: string, node: string) => void;
  fail: (error: unknown) => void;
  update: (section: Section) => Promise<void>;
  onChooseTexts: () => void;
  onAdd: () => void;
  children: ReactNode;
}
export function ManuscriptEditor({
  project,
  selected,
  doc,
  editor,
  hidden,
  filters,
  scrollActivity,
  input,
  onOutlineDetails,
  fail,
  update,
  onChooseTexts,
  onAdd,
  children,
}: Props) {
  const { openTagFilter, removeTagAssignment, tagRemovalLabel } = filters;
  return (
    <WritingSurface
      titleTagInput={
        selected
          ? {
              tags: effectiveTags(project.smartTags ?? [], project.sections, selected.id).map(
                ({ tag }) => tag,
              ),
              create: doc.createSmartTag,
              assign: (id) => doc.addSectionTag(selected.id, id),
              open: openTagFilter,
              remove: (id) => {
                const assignment = effectiveTags(
                  project.smartTags ?? [],
                  project.sections,
                  selected.id,
                ).find(({ tag }) => tag.id === id);
                if (assignment) return removeTagAssignment(assignment);
              },
              removalLabel: (id) => {
                const assignment = effectiveTags(
                  project.smartTags ?? [],
                  project.sections,
                  selected.id,
                ).find(({ tag }) => tag.id === id);
                return assignment ? tagRemovalLabel(assignment) : '';
              },
              onError: fail,
              onPending: doc.trackTagWork,
              registerFlusher: doc.registerTagFlusher,
            }
          : undefined
      }
      historyMode={hidden}
      projectName={project.name}
      selected={selected}
      editorRef={editor}
      editorProps={{
        ...input,
        smartTags: project.smartTags,
        tagSections: project.sections,
        createSmartTag: doc.createSmartTag,
        onSmartTag: openTagFilter,
        onRemoveSmartTag: (section, node, id) => {
          const assignment = effectiveTags(
            project.smartTags ?? [],
            project.sections,
            section,
            node,
          ).find(({ tag }) => tag.id === id);
          if (assignment) return removeTagAssignment(assignment);
        },
        onTagWork: doc.trackTagWork,
        registerTagFlusher: doc.registerTagFlusher,
        onOutlineDetails: (section, node, outline) => {
          const original = project.sections.find((s) => s.id === section);
          if (original && !original.outline)
            doc.edit(new Map([[section, original.text]]), new Map([[section, outline]]));

          onOutlineDetails(section, node);
        },
        generation: doc.generation,
        sessionSettings: () => doc.settingsRef.current,
        onSessionChange: doc.stageSettings,
        settings: doc.settings,
        projectPath: project.path,
        noteLookup: (query) => request('noteSuggestions', { projectPath: project.path, query }),
        noteResolve: (ids) => request('noteReferences', { projectPath: project.path, ids }),
        onNoteError: fail,
        onChange: doc.edit,
        onDraftChange: doc.editDraft,
      }}
      onScroll={scrollActivity.onScroll}
      onScrollEnd={scrollActivity.onScrollEnd}
      onTitle={(title) => {
        if (selected) return update({ ...selected, title }).catch(fail);
      }}
      onChooseTexts={onChooseTexts}
      onAdd={onAdd}
    >
      {children}
    </WritingSurface>
  );
}
