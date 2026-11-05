import type { NoteEventInput } from '../contracts/noteActivity';
import { localizeMessage, t, useLocale } from '../i18n';
import { useState, useEffect } from 'react';
import type { Section } from '../contracts/project';
import type { Source } from '../contracts/sources';
import { Dialog } from '../components/Dialog';
import { request } from '../platform/client';
export function Preparation({
  onNoteActivity,
  section,
  onSave,
  onClose,
}: {
  onNoteActivity?: (event: NoteEventInput) => unknown;
  section: Section;
  onSave: (s: Section) => Promise<void>;
  onClose: () => void;
}) {
  useLocale();
  const [value, setValue] = useState({ ...section });
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Source[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void request('links', { section: section.id })
      .then(setLinks)
      .catch((e) => setError(String(e)));
  }, [section.id]);
  return (
    <Dialog title={t('Préparation')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(value);
            for (const source of links) {
              await request('associate', { section: section.id, id: source.id, payload: source });
              onNoteActivity?.({
                kind: 'associated',
                title: source.title,
                sourceId: source.id,
                section: section.id,
              });
            }
            onClose();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t('Titre')}
          <input
            required
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <label>
          {t('Synopsis')}
          <textarea
            value={value.synopsis}
            rows={5}
            onChange={(e) => setValue({ ...value, synopsis: e.target.value })}
            placeholder={t('Ce que cette section doit raconter…')}
          />
        </label>
        <div className="form-columns">
          <label>
            {t('Statut')}
            <select
              value={value.status}
              onChange={(e) => setValue({ ...value, status: e.target.value })}
            >
              <option value="Brouillon">{t('Brouillon')}</option>
              <option value="En cours">{t('En cours')}</option>
              <option value="À relire">{t('À relire')}</option>
              <option value="Terminé">{t('Terminé')}</option>
            </select>
          </label>
          <label>
            {t('Objectif de mots')}
            <input
              type="number"
              min="0"
              value={value.goal}
              onChange={(e) => setValue({ ...value, goal: Number(e.target.value) })}
            />
          </label>
        </div>
        {links.length > 0 && (
          <div className="preparation-links">
            <h3>{t('Fiches du projet')}</h3>
            <p className="hint">
              {t('Ces fiches sont propres au projet. Les notes du vault restent inchangées.')}
            </p>
            {links.map((source, i) => (
              <div key={source.id}>
                <label>
                  {t(source.kind)}
                  <input
                    value={source.title}
                    onChange={(e) =>
                      setLinks(links.map((s, j) => (i === j ? { ...s, title: e.target.value } : s)))
                    }
                  />
                </label>
                <textarea
                  aria-label={t('Notes sur ') + source.title}
                  rows={3}
                  value={source.text}
                  onChange={(e) =>
                    setLinks(links.map((s, j) => (i === j ? { ...s, text: e.target.value } : s)))
                  }
                />
              </div>
            ))}
          </div>
        )}
        {error && <p className="error-text">{localizeMessage(error)}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('Annuler')}
          </button>
          <button className="primary" disabled={busy}>
            {t('Enregistrer')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
