import { lazy, Suspense } from 'react';
import type { Workspace } from './useWorkspace';
import { request, native, browserProjects } from './client';
import type { Project } from './types';
const Library = lazy(() => import('../sources/Library').then((m) => ({ default: m.Library })));
import { Preparation } from '../project/Preparation';
const History = lazy(() => import('../history/History').then((m) => ({ default: m.History })));
const Export = lazy(() => import('../export/Export').then((m) => ({ default: m.Export })));
import { Welcome } from './Welcome';
import { Dialog } from '../components/Dialog';
export function WorkspaceDialogs({ workspace, onMemory }: { workspace: Workspace; onMemory?: () => void }) {
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
    activate,
    apply,
    setNewProject,
    newSection,
    setNewSection,
    newTitle,
    setNewTitle,
    add,
  } = workspace;
  if (!p) return null;
  return (
    <Suspense fallback={<div className="notice recovery">Ouverture…</div>}>
      {surface === 'sources' && (
        <Library
          onMemory={onMemory ? () => { close(); onMemory(); } : undefined}
          onClose={close}
          onError={fail}
          onRefresh={() => setSourceVersion((v) => v + 1)}
          onIndexProgress={setProgress}
          onBusy={(v) => {
            if (!v) setProgress(null);
          }}
        />
      )}
      {surface === 'prepare' && selected && (
        <Preparation key={selected.id} section={selected} onClose={close} onSave={update} />
      )}
      {surface === 'history' && (
        <History
          project={p}
          active={active}
          onClose={close}
          flush={doc.flush}
          onRestore={activate}
          onApply={apply}
          onError={fail}
        />
      )}
      {surface === 'export' && (
        <Export
          project={p}
          active={active}
          flush={doc.flush}
          onClose={close}
          job={workspace.exportJob}
        />
      )}
      {surface === 'projects' && (
        <Dialog title="Vos projets" onClose={close}>
          <button
            onClick={() => {
              close();
              void doc.flush().then(() => setNewProject(true));
            }}
          >
            Créer un projet
          </button>
          {native ? (
            <Welcome
              onOpen={(p) => {
                activate(p);
                close();
              }}
              onError={fail}
            />
          ) : (
            browserProjects().map((p) => (
              <button
                className="project-list-item"
                key={p.path}
                onClick={() =>
                  void doc
                    .flush()
                    .then(() => request<Project>('open', { path: p.path }))
                    .then((p) => {
                      activate(p);
                      close();
                    })
                    .catch(fail)
                }
              >
                {p.name}
              </button>
            ))
          )}
        </Dialog>
      )}
      {newSection && (
        <Dialog
          title={
            'Ajouter ' +
            { scene: 'une scène', chapter: 'un chapitre', folder: 'un dossier' }[newSection.kind]
          }
          onClose={() => setNewSection(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label>
              Titre
              <input
                autoFocus
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setNewSection(null)}>
                Annuler
              </button>
              <button className="primary">Ajouter</button>
            </div>
          </form>
        </Dialog>
      )}
    </Suspense>
  );
}
