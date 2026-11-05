import { localizeMessage, t, useLocale } from '../i18n';
import { Presence } from '../components/Presence';
import type { Workspace } from './useWorkspace';
import { request } from '../platform/client';
import { X } from 'lucide-react';
export function WorkspaceNotices({ workspace }: { workspace: Workspace; embedded?: boolean }) {
  useLocale();
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
      {workspace.progress && (
        <div className="path-notice-detail" role="status">
          <span>
            {t('Préparation des sources · {0} / {1}', {
              0: workspace.progress.done,
              1: workspace.progress.total,
            })}
          </span>
          <progress max={workspace.progress.total} value={workspace.progress.done} />
          <button onClick={() => void request('cancelIndex').catch(fail)}>{t('Suspendre')}</button>
        </div>
      )}
      <Presence kind="notice">
        {surface !== 'export' && exportJob.state !== 'ready' && (
          <div className={'path-notice-detail'} role="status">
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
          <div className={'path-notice-detail'}>
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
          <div className={'path-notice-detail path-notice-error'} role="alert">
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
    </>
  );
}
