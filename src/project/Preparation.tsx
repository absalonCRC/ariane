import { useState, useEffect } from 'react';
import type { Section, Source } from '../app/types';
import { Dialog } from '../components/Dialog';
import { request } from '../app/client';
export function Preparation({
  section,
  onSave,
  onClose,
}: {
  section: Section;
  onSave: (s: Section) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState({ ...section });
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Source[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void request<Source[]>('links', { section: section.id })
      .then(setLinks)
      .catch((e) => setError(String(e)));
  }, [section.id]);
  return (
    <Dialog title="Préparation" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(value);
            for (const source of links)
              await request('associate', { section: section.id, id: source.id, payload: source });
            onClose();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Titre
          <input
            required
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <label>
          Synopsis
          <textarea
            value={value.synopsis}
            rows={5}
            onChange={(e) => setValue({ ...value, synopsis: e.target.value })}
            placeholder="Ce que cette section doit raconter…"
          />
        </label>
        <div className="form-columns">
          <label>
            Statut
            <select
              value={value.status}
              onChange={(e) => setValue({ ...value, status: e.target.value })}
            >
              <option>Brouillon</option>
              <option>En cours</option>
              <option>À relire</option>
              <option>Terminé</option>
            </select>
          </label>
          <label>
            Objectif de mots
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
            <h3>Fiches du projet</h3>
            <p className="hint">
              Ces fiches sont propres au projet. Les notes du vault restent inchangées.
            </p>
            {links.map((source, i) => (
              <div key={source.id}>
                <label>
                  {source.kind}
                  <input
                    value={source.title}
                    onChange={(e) =>
                      setLinks(links.map((s, j) => (i === j ? { ...s, title: e.target.value } : s)))
                    }
                  />
                </label>
                <textarea
                  aria-label={'Notes sur ' + source.title}
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
        {error && <p className="error-text">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button className="primary" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>
    </Dialog>
  );
}
