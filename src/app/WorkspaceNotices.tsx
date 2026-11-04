import { localizeMessage, t, useLocale } from '../i18n';
import { Presence } from '../components/Presence';
import type { Workspace } from './useWorkspace';
import { request } from '../platform/client';
import { X } from 'lucide-react';
import { useContextMenuNotice } from '../components/ContextMenu';
export function WorkspaceNotices({
  workspace,
  embedded = false,
}: {
  workspace: Workspace;
  embedded?: boolean;
}) {
  useLocale();
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
            <span>{localizeMessage(workspace.libraryNotice.message)}</span>
            {workspace.libraryNotice.undo && doc.project?.canUndoStructure && (
              <button
                disabled={workspace.libraryBusy}
                onClick={() => void workspace.operate({ action: 'undo' })}
              >
                {t('Annuler')}
              </button>
            )}
            <button
              className="icon-button"
              aria-label={t('Fermer le message de rangement')}
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
                ? t('Export en cours…')
                : exportJob.state === 'done'
                  ? t('Votre manuscrit est prêt.')
                  : t('L’export n’a pas abouti.')}
            </span>
            <button onClick={() => setSurface('export')}>{t('Voir l’export')}</button>
            {exportJob.state !== 'working' && (
              <button onClick={exportJob.reset}>{t('Fermer')}</button>
            )}
          </div>
        )}
      </Presence>
      <Presence kind="notice">
        {recovery && (
          <div className={embedded ? 'path-notice-detail' : 'notice recovery'}>
            <span>{t('Votre texte a été récupéré.')}</span>
            <button onClick={() => setRecovery(false)}>{t('Reprendre l’écriture')}</button>
            <button
              onClick={() => {
                setRecovery(false);
                setSurface('history');
              }}
            >
              {t('Voir les versions')}
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
                ? t('Ce texte a été modifié ailleurs. Une copie sera conservée avant résolution.')
                : localizeMessage(error)}
            </span>
            {error.startsWith('EXTERNAL:') ? (
              <>
                <button
                  onClick={() =>
                    void request('resolveExternal', {
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
                  {t('Lire la version externe')}
                </button>
                <button
                  onClick={() =>
                    void request('resolveExternal', {
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
                  {t('Conserver mon texte')}
                </button>
              </>
            ) : doc.status === 'error' ? (
              <button
                onClick={() => {
                  setError('');
                  void doc.flush().catch(fail);
                }}
              >
                {t('Réessayer')}
              </button>
            ) : null}
            <button
              className="icon-button"
              aria-label={t('Fermer le message')}
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
              <span>{localizeMessage(contextNotice.message)}</span>
              <button onClick={contextNotice.clear}>{t('Fermer')}</button>
            </div>
          )}
        </Presence>
      )}
    </>
  );
}
