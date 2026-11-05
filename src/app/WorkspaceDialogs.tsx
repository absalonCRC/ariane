import { t, useLocale } from '../i18n';
import { ImportProject } from '../project/ImportProject';
import { ManuscriptDialog } from '../project/ManuscriptDialog';
import { Presence } from '../components/Presence';
import { lazy, Suspense, useEffect } from 'react';
import type { Workspace } from './useWorkspace';
import { choosePath } from './choosePath';
import { native } from '../platform/client';
import { ProjectCatalog } from '../project/ProjectCatalog';
import { Preparation } from '../project/Preparation';
import { Preferences } from './Preferences';
import { Dialog } from '../components/Dialog';
import { TagManager } from '../tags/TagManager';
const Library = lazy(() => import('../sources/Library').then((m) => ({ default: m.Library })));

const Export = lazy(() => import('../export/Export').then((m) => ({ default: m.Export })));

function LoadingNotice({ onLoading }: { onLoading?: (loading: boolean) => void }) {
  useEffect(() => {
    onLoading?.(true);
    return () => onLoading?.(false);
  }, [onLoading]);
  return null;
}

export function WorkspaceDialogs({
  workspace,
  onMemory,
  onLoading,
  onNotice,
  onTagFilter,
}: {
  workspace: Workspace;
  onLoading?: (loading: boolean) => void;
  onNotice?: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onMemory?: () => void;
  onTagFilter?: (id: string) => void;
}) {
  useLocale();
  const {
    surface,
    doc,
    close,
    fail,
    setSourceVersion,
    setProgress,
    selected,
    update,
    p,
    active,
    setNewProject,
  } = workspace;
  if (!p) return null;
  return (
    <Suspense fallback={<LoadingNotice onLoading={onLoading} />}>
      {surface === 'tags' && (
        <TagManager
          project={p}
          onError={fail}
          onOperation={async (operation) => {
            const context = workspace.editor.current?.context(),
              path = p.path;
            await doc.tagOperation(operation);
            if (context && doc.ref.current?.path === path)
              requestAnimationFrame(() => {
                if (doc.ref.current?.path === path)
                  workspace.editor.current?.restoreContext(context);
              });
          }}
          onClose={close}
          onFilter={onTagFilter}
        />
      )}
      {surface === 'import' && (
        <ImportProject
          projectPath={p.path}
          onClose={close}
          onOpen={workspace.activate}
          beforeImport={doc.flush}
        />
      )}
      {surface === 'manuscript' && workspace.manuscriptSelection && (
        <ManuscriptDialog workspace={workspace} />
      )}
      <Presence>
        {surface === 'preferences' && (
          <Preferences
            project={p}
            onError={fail}
            theme={workspace.appearance.theme}
            onTheme={workspace.appearance.change}
            onExport={() => workspace.setSurface('export')}
            onHistory={() => workspace.setSurface('history')}
            onTags={() => workspace.setSurface('tags')}
            sources={
              <>
                <Library
                  onNotice={onNotice}
                  onNoteActivity={workspace.activity.record}
                  embedded
                  onClose={close}
                  onError={fail}
                  onRefresh={() => setSourceVersion((v) => v + 1)}
                  onIndexProgress={setProgress}
                  onBusy={(v) => {
                    if (!v) setProgress(null);
                  }}
                />
              </>
            }
            value={doc.settings}
            onChange={doc.configure}
            onClose={close}
            enrichmentError={workspace.enrichmentError}
          />
        )}
      </Presence>
      <Presence>
        {surface === 'sources' && (
          <Library
            onNotice={onNotice}
            onNoteActivity={workspace.activity.record}
            onMemory={
              onMemory
                ? () => {
                    close();
                    onMemory();
                  }
                : undefined
            }
            onClose={close}
            onError={fail}
            onRefresh={() => setSourceVersion((v) => v + 1)}
            onIndexProgress={setProgress}
            onBusy={(v) => {
              if (!v) setProgress(null);
            }}
          />
        )}
      </Presence>
      <Presence>
        {surface === 'prepare' && selected && (
          <Preparation
            onNoteActivity={workspace.activity.record}
            key={selected.id}
            section={selected}
            onClose={close}
            onSave={update}
          />
        )}
      </Presence>
      <Presence>
        {surface === 'export' && (
          <Export
            project={p}
            active={active}
            flush={doc.flush}
            onClose={close}
            job={workspace.exportJob}
          />
        )}
      </Presence>
      <Presence>
        {surface === 'projects' && (
          <Dialog title={t('Vos projets')} onClose={close}>
            <button
              onClick={() => {
                close();
                void doc.flush().then(() => setNewProject(true));
              }}
            >
              {t('Créer un projet')}
            </button>
            {native && (
              <button
                onClick={async () => {
                  try {
                    const path = await choosePath('open', {
                      title: t('Ouvrir un projet ariane'),
                    });
                    if (typeof path === 'string') await workspace.openProject(path);
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                {t('Ouvrir un dossier…')}
              </button>
            )}
            <ProjectCatalog onOpen={workspace.openProject} onError={fail} />
          </Dialog>
        )}
      </Presence>
    </Suspense>
  );
}
