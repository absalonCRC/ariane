import type { RefObject, ComponentProps } from 'react';
import type { Project } from '../contracts/project';
import type { EditorHandle } from '../editor/types';
import type { EntityManagerController } from '../entities/useEntityManager';
import { t } from '../i18n';
import { useMemo } from 'react';
import { titleContexts } from '../project/titleContexts';
import { ordered } from '../project/tree';
import { StructuredSearch } from '../search/StructuredSearch';
import { Palette, type Command } from './Palette';
import type { Workspace } from './useWorkspace';

type Props = Pick<
  ComponentProps<typeof Palette>,
  'panel' | 'retainContent' | 'onOpen' | 'onClose' | 'onTextSearch' | 'initialQuery'
> &
  Pick<
    Workspace,
    'captureSplitPreview' | 'confirmSplitPreview' | 'splitPreview' | 'historyMode'
  > & {
    mode: Workspace['palette'];
    query: string;
    project: Project;
    manager: EntityManagerController;
    canSplit: boolean;
    commands: Command[];
    editor: RefObject<EditorHandle | null>;
    select: (id: string) => Promise<boolean>;
    onQuery: (value: string) => void;
    onOpenQuery: ComponentProps<typeof StructuredSearch>['onOpen'];
    onMemory: (view: { kind: 'resume' | 'list' }) => void;
  };
export function WorkspacePalette({
  mode,
  query,
  project: p,
  manager,
  panel,
  retainContent,
  onOpen,
  onClose,
  initialQuery,
  onTextSearch,
  onQuery,
  onOpenQuery,
  onMemory,
  editor,
  canSplit,
  historyMode,
  splitPreview,
  captureSplitPreview,
  confirmSplitPreview,
  commands,
  select,
}: Props) {
  const untitled = t('Sans titre');
  const sectionResults = useMemo(() => {
    if (mode !== 'sections') return [];
    const sections = ordered(p.sections).filter((s) => !s.trashed);
    const contexts = titleContexts(sections, p.name, untitled);
    return sections.map((section) => ({ section, context: contexts.get(section.id) }));
  }, [mode, p.sections, p.name, untitled]);
  return (
    <Palette
      open={!!mode}
      sections={mode === 'sections'}
      textSearch={mode === 'text'}
      searchScope={p.path}
      initialQuery={initialQuery}
      onTextSearch={onTextSearch}
      onOpenPanel={() => captureSplitPreview(canSplit)}
      extraResults={
        mode === 'text' ? (
          <StructuredSearch
            query={query}
            project={p}
            manager={manager}
            onQuery={onQuery}
            onOpen={onOpenQuery}
          />
        ) : undefined
      }
      onNextMatch={(query, backwards) =>
        editor.current?.findText(query, backwards ? 'previous' : 'next')
      }
      panel={panel}
      retainContent={retainContent}
      onOpen={onOpen}
      onClose={onClose}
      commands={
        mode === 'sections'
          ? sectionResults.map(({ section, context }) => ({
              context,
              id: 'section:' + section.id,
              label: section.title || t('Sans titre'),
              detail:
                section.kind === 'scene'
                  ? t('Scène')
                  : section.kind === 'chapter'
                    ? t('Chapitre')
                    : t('Section'),
              action: () => void select(section.id),
            }))
          : [
              ...commands,
              ...(splitPreview && canSplit && !historyMode
                ? [
                    {
                      id: 'split-scene',
                      label: t('Scinder la scène'),
                      preview: splitPreview,
                      action: () => confirmSplitPreview(splitPreview!),
                    },
                  ]
                : []),
              {
                id: 'resume',
                label: t('Reprendre le fil'),
                action: () => onMemory({ kind: 'resume' }),
              },
              {
                id: 'manuscript-entities',
                label: t('Fiches du manuscrit'),
                action: () => onMemory({ kind: 'list' }),
              },
            ].filter((command) => command.id !== 'sources')
      }
    />
  );
}
