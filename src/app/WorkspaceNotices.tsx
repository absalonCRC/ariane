import { Presence } from '../components/Presence';
import type { Workspace } from './useWorkspace';
import { request } from './client';
import type { Project } from './types';
import { X } from 'lucide-react';
import { useContextMenuNotice } from '../components/ContextMenu';
export function WorkspaceNotices({
  workspace,
  embedded = false,
}: {
  workspace: Workspace;
  embedded?: boolean;
}) {
  const contextNotice = useContextMenuNotice();
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
        {!embedded && workspace.libraryNotice && !error && !recovery && (
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
          <div className={embedded ? 'path-notice-detail' : 'notice recovery'} role="status">
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
          <div className={embedded ? 'path-notice-detail' : 'notice recovery'}>
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
          <div
            className={embedded ? 'path-notice-detail path-notice-error' : 'notice error-notice'}
            role="alert"
          >
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
            ) : doc.status === 'error' ? (
              <button
                onClick={() => {
                  setError('');
                  void doc.flush().catch(fail);
                }}
              >
                Réessayer
              </button>
            ) : null}
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
      {!embedded && (
        <Presence kind="notice">
          {contextNotice.message && (
            <div className="notice recovery" role="alert">
              <span>{contextNotice.message}</span>
              <button onClick={contextNotice.clear}>Fermer</button>
            </div>
          )}
        </Presence>
      )}
    </>
  );
}
