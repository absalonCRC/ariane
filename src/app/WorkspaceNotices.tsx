import { Presence } from '../components/Presence';
import type { Workspace } from './useWorkspace';
import { request } from './client';
import type { Project } from './types';
import { X } from 'lucide-react';
export function WorkspaceNotices({ workspace }: { workspace: Workspace }) {
  const {
    recovery,
    setRecovery,
    setSurface,
    error,
    setError,
    doc,
    activate,
    fail,
    exportJob,
    surface,
  } = workspace;
  return (
    <>
      <Presence kind="notice">
        {workspace.libraryNotice && !error && !recovery && (
          <div className="notice library-notice" role="status">
            <span>{workspace.libraryNotice.message}</span>
            {workspace.libraryNotice.undo && doc.project?.canUndoStructure && (
              <button
                disabled={workspace.libraryBusy}
                onClick={() => void workspace.operate({ action: 'undo' })}
              >
                Annuler
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Fermer le message de rangement"
              onClick={() => workspace.setLibraryNotice(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </Presence>
      <Presence kind="notice">
        {surface !== 'export' && exportJob.state !== 'ready' && (
          <div className="notice recovery" role="status">
            <span>
              {exportJob.state === 'working'
                ? 'Export en cours…'
                : exportJob.state === 'done'
                  ? 'Votre manuscrit est prêt.'
                  : 'L’export n’a pas abouti.'}
            </span>
            <button onClick={() => setSurface('export')}>Voir l’export</button>
            {exportJob.state !== 'working' && <button onClick={exportJob.reset}>Fermer</button>}
          </div>
        )}
      </Presence>
      <Presence kind="notice">
        {recovery && (
          <div className="notice recovery">
            <span>Votre texte a été récupéré.</span>
            <button onClick={() => setRecovery(false)}>Reprendre l’écriture</button>
            <button
              onClick={() => {
                setRecovery(false);
                setSurface('history');
              }}
            >
              Voir les versions
            </button>
          </div>
        )}
      </Presence>
      <Presence kind="notice">
        {error && (
          <div className="notice error-notice" role="alert">
            <span>
              {error.startsWith('EXTERNAL:')
                ? 'Ce texte a été modifié ailleurs. Une copie sera conservée avant résolution.'
                : error}
            </span>
            {error.startsWith('EXTERNAL:') ? (
              <>
                <button
                  onClick={() =>
                    void request<Project>('resolveExternal', {
                      id: error.split(':')[1],
                      keepLocal: false,
                      pending:
                        doc.ref.current?.sections.find((s) => s.id === error.split(':')[1])?.text ??
                        null,
                    })
                      .then((p) => {
                        activate(p);
                        setError('');
                      })
                      .catch(fail)
                  }
                >
                  Lire la version externe
                </button>
                <button
                  onClick={() =>
                    void request<Project>('resolveExternal', {
                      id: error.split(':')[1],
                      keepLocal: true,
                      pending:
                        doc.ref.current?.sections.find((s) => s.id === error.split(':')[1])?.text ??
                        null,
                    })
                      .then((p) => {
                        activate(p);
                        setError('');
                      })
                      .catch(fail)
                  }
                >
                  Conserver mon texte
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setError('');
                  if (doc.status === 'error') void doc.flush().catch(() => {});
                }}
              >
                Réessayer
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Fermer le message"
              onClick={() => setError('')}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </Presence>
    </>
  );
}
