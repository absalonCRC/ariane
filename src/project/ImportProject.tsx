import { localizeMessage, t, useLocale } from '../i18n';
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Dialog } from '../components/Dialog';
import { native, request } from '../app/client';
import type { Project } from '../app/types';
interface Report {
  source: string;
  projectName: string;
  projectPath?: string;
  items: { source: string; title: string; folder: string; format: string }[];
  copiedFiles: number;
  warnings: string[];
}
export function ImportProject({
  onOpen,
  onClose,
  beforeImport,
  projectPath,
}: {
  onOpen: (project: Project) => void;
  onClose: () => void;
  beforeImport?: () => Promise<unknown>;
  projectPath?: string;
}) {
  useLocale();
  const [report, setReport] = useState<Report | null>(null);
  const [done, setDone] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function choose(directory: boolean) {
    setBusy(true);
    setError('');
    try {
      const source = await open({
        directory,
        title: directory ? t('Dossier Markdown ou TextBundle') : t('Importer un manuscrit'),
        ...(!directory
          ? { filters: [{ name: t('Textes'), extensions: ['md', 'markdown', 'txt', 'docx'] }] }
          : {}),
      });
      if (typeof source === 'string') setReport(await request<Report>('importPreview', { source }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importProject() {
    if (!report || !projectPath) return;
    setBusy(true);
    setError('');
    try {
      await beforeImport?.();
      const result = await request<{ project: Project; report: Report }>('importIntoProject', {
        source: report.source,
        projectPath,
      });
      setReport(result.report);
      setDone(result.project);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={done ? t('Import terminé') : t('Importer un manuscrit')}
      onClose={() => {
        if (!busy) {
          if (done) onOpen(done);
          onClose();
        }
      }}
      modal
      wide
    >
      {!done && (
        <>
          <p>
            {t(
              'Markdown, dossier de textes, DOCX ou TextBundle. Les textes sont ajoutés au projet ouvert.',
            )}
          </p>
          <div className="dialog-actions">
            <button disabled={busy || !native} onClick={() => void choose(false)}>
              {t('Choisir un fichier…')}
            </button>
            <button disabled={busy || !native} onClick={() => void choose(true)}>
              {t('Choisir un dossier…')}
            </button>
          </div>
          {!native && (
            <p className="hint">{t('L’import est disponible dans l’application Mac.')}</p>
          )}
        </>
      )}
      {!projectPath && (
        <p className="hint">{t('Ouvrez ou créez un projet pour y importer ces textes.')}</p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {localizeMessage(error)}
        </p>
      )}
      {report && (
        <>
          <p>
            {t('{0} textes · {1} ressources copiées', {
              0: report.items.length,
              1: report.copiedFiles,
            })}
          </p>
          <ul className="import-items">
            {report.items.map((item) => (
              <li key={item.source}>
                {item.source} → {item.title}
              </li>
            ))}
          </ul>
          <ul>
            {report.warnings.map((w) => (
              <li key={w}>{localizeMessage(w)}</li>
            ))}
          </ul>
          {done && (
            <p className="hint">
              {t(
                'Les textes sont ajoutés au projet courant ; les fichiers source restent à leur emplacement.',
              )}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="primary"
              disabled={busy || !projectPath}
              onClick={() => (done ? (onOpen(done), onClose()) : void importProject())}
            >
              {busy
                ? t('Import en cours…')
                : done
                  ? t('Écrire dans ce projet')
                  : t('Importer dans ce projet')}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
