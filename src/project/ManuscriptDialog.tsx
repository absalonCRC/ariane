import { t, useLocale } from '../i18n';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import type { Workspace } from '../app/useWorkspace';
import type { ManuscriptOperation } from './library';
import { ordered } from './tree';
export function ManuscriptDialog({ workspace: w }: { workspace: Workspace }) {
  useLocale();
  const selected = w.manuscriptSelection!;
  const source = w.p!.sections.find((s) => s.id === selected.section)!;
  const scenes = ordered(w.p!.sections).filter((s) => s.kind === 'scene');
  const siblings = scenes.filter(
    (s) => s.parent === source.parent && (s.role || 'manuscript') === (source.role || 'manuscript'),
  );
  const next = siblings[siblings.indexOf(source) + 1];
  const [action, setAction] = useState<ManuscriptOperation['action']>('split');
  const [title, setTitle] = useState(`${source.title} — suite`);
  const destination = next;
  return (
    <Dialog
      title={t('Réorganiser le texte')}
      modal
      onClose={() => {
        if (!w.libraryBusy) w.close();
      }}
    >
      <p>{source.title}</p>
      <label>
        {t('Opération')}
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as ManuscriptOperation['action'])}
        >
          <option value="split">{t('Séparer au curseur')}</option>
          <option value="join">{t('Réunir avec la scène suivante')}</option>
        </select>
      </label>
      {action === 'split' && (
        <label>
          {t('Titre de la nouvelle scène')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}
      {action === 'join' && (
        <p>
          {next
            ? t('« {0} » sera ajoutée à la fin. Sa scène d’origine restera dans la corbeille.', {
                0: next.title,
              })
            : t('Aucune scène suivante dans ce dossier.')}
        </p>
      )}
      <div className="dialog-actions">
        <button onClick={w.close} disabled={w.libraryBusy}>
          {t('Annuler')}
        </button>
        <button
          className="primary"
          disabled={
            w.libraryBusy ||
            (action === 'split'
              ? selected.from <= 0 || selected.from >= source.text.length
              : !destination)
          }
          onClick={() =>
            void w.manuscriptOperation({
              action,
              sourceId: source.id,
              offset: selected.from,
              targetId: destination?.id,
              title,
            })
          }
        >
          {w.libraryBusy ? t('Enregistrement…') : t('Appliquer')}
        </button>
      </div>
    </Dialog>
  );
}
