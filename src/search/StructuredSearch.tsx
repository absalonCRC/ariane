import { useState } from 'react';
import type { StructuredQuery } from '../contracts/structuredQuery';
import type { EntityManagerController } from '../entities/useEntityManager';
import type { Project } from '../contracts/project';
import { resolveQuery, queryLabel } from './resolveQuery';
import { normalizeName, quoteName } from './query';
import { t, localizeMessage } from '../i18n';
export function StructuredSearch({
  query,
  project,
  manager,
  onOpen,
  onQuery,
}: {
  query: string;
  project: Project;
  manager: EntityManagerController;
  onOpen: (query: StructuredQuery, name?: string) => void;
  onQuery: (query: string) => void;
}) {
  const [name, setName] = useState(''),
    [editId, setEditId] = useState<string | null>(null),
    [choices, setChoices] = useState<Record<string, string>>({});
  let resolved: StructuredQuery | undefined,
    error = '';
  const structured = /^[#@]/.test(query.trim());
  try {
    if (structured)
      resolved = resolveQuery(query, project.smartTags ?? [], manager.catalog, choices);
  } catch (e) {
    error = String(e).replace(/^Error: /, '');
  }
  const tail = /(?:^|[+,])\s*([#@])([^+,]*)$/.exec(query),
    needle = normalizeName((tail?.[2] ?? '').replace(/^"|"$/g, ''));
  const suggestions = tail
    ? (tail[1] === '#'
        ? (project.smartTags ?? []).map((tag) => ({
            kind: 'tag',
            id: tag.id,
            name: tag.name,
            detail: '',
          }))
        : manager.catalog.entities
            .filter((e) => !e.redirect)
            .map((e) => ({
              kind: 'entity',
              id: e.id,
              name: e.title,
              detail: e.kind + ' · ' + e.id.slice(0, 8),
            }))
      )
        .filter((v) => normalizeName(v.name).includes(needle))
        .slice(0, 12)
    : [];
  const views = manager.views.filter(
    (v) => !structured && v.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="structured-search">
      {structured && (
        <>
          <p className="hint">{t('+ : ET · , : OU · ET est évalué en premier')}</p>
          {error && <p role="status">{localizeMessage(error)}</p>}
          <div className="query-suggestions">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  const start = query.lastIndexOf(tail![1]);
                  setChoices({ ...choices, [s.kind + ':' + normalizeName(s.name)]: s.id });
                  onQuery(query.slice(0, start) + tail![1] + quoteName(s.name));
                }}
              >
                {tail![1]}
                {s.name} <small>{s.detail}</small>
              </button>
            ))}
          </div>
          <button
            disabled={!resolved || manager.busy}
            onClick={() => {
              if (resolved) onOpen(resolved);
            }}
          >
            {t('Afficher les passages')}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (resolved)
                void manager
                  .saveView({ id: editId ?? crypto.randomUUID(), name, query: resolved })
                  .then(() => {
                    setName('');
                    setEditId(null);
                  })
                  .catch(() => {});
            }}
          >
            <label>
              {t('Nom de la vue')}
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button disabled={!resolved || manager.busy}>
              {t(editId ? 'Mettre à jour la vue' : 'Enregistrer la vue')}
            </button>
          </form>
        </>
      )}
      {!structured && views.length > 0 && (
        <>
          <h3>{t('Vues enregistrées')}</h3>
          {views.map((view) => {
            let label = '',
              invalid = '';
            try {
              label = queryLabel(view.query, project.smartTags ?? [], manager.catalog);
            } catch (e) {
              invalid = localizeMessage(e);
            }
            return (
              <div key={view.id}>
                <button disabled={!!invalid} onClick={() => onOpen(view.query, view.name)}>
                  {view.name}
                </button>
                <small>{invalid || label}</small>
                <button
                  onClick={() => {
                    setEditId(view.id);
                    setName(view.name);
                    if (!invalid) onQuery(label);
                  }}
                >
                  {t('Renommer ou modifier')}
                </button>
                <button
                  disabled={manager.busy}
                  onClick={() => void manager.saveView(undefined, view.id).catch(() => {})}
                >
                  {t('Supprimer la vue')}
                </button>
              </div>
            );
          })}
        </>
      )}
      {manager.error && <p role="alert">{localizeMessage(manager.error)}</p>}
    </div>
  );
}
