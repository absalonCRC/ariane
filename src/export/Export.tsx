import { Dialog } from '../components/Dialog';
import type { Project } from '../app/types';
import type { ExportJob } from './useExport';
export function Export({
  project,
  active,
  flush,
  onClose,
  job,
}: {
  project: Project;
  active: string | null;
  flush: () => Promise<void>;
  onClose: () => void;
  job: ExportJob;
}) {
  const { format, setFormat, scope, setScope, state, result } = job;
  return (
    <Dialog
      title={
        state === 'done'
          ? 'Votre manuscrit est prêt.'
          : state === 'error'
            ? 'L’export n’a pas abouti'
            : 'Exporter le manuscrit'
      }
      onClose={onClose}
    >
      <div className="state-content" key={state}>
        {state === 'ready' ? (
          <>
            <div className="segmented formats">
              {[
                ['md', 'Markdown'],
                ['pdf', 'PDF'],
                ['docx', 'Word'],
                ['epub', 'EPUB'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  className={format === v ? 'active' : ''}
                  onClick={() => setFormat(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Contenu
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="project">Manuscrit entier</option>
                {active && <option value="section">Section actuelle</option>}
              </select>
            </label>
            <p className="hint">
              Titres, texte Markdown et notes de bas de page seront assemblés dans l’ordre du
              projet. Les textes exclus sont omis du manuscrit entier ; l’export de la section
              actuelle les conserve.
            </p>
            <div className="dialog-actions">
              <button onClick={onClose}>Annuler</button>
              <button className="primary" onClick={() => void job.run(project, active, flush)}>
                Exporter
              </button>
            </div>
          </>
        ) : state === 'working' ? (
          <div className="export-progress">
            <span className="indeterminate" />
            <p>Préparation du document…</p>
            <p className="hint">Vous pouvez fermer cette fenêtre et continuer à écrire.</p>
            <button onClick={() => void job.cancel()}>Annuler l’export</button>
          </div>
        ) : (
          <>
            <p className={state === 'error' ? 'error-text' : 'export-result'}>{result}</p>
            <div className="dialog-actions">
              <button onClick={job.reset}>
                {state === 'error' ? 'Réessayer' : 'Nouvel export'}
              </button>
              <button className="primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
