import { useState } from 'react';
import type { EntityIdentity } from '../contracts/entityIdentity';
import type { EntityRelation } from '../contracts/entityRelations';
import type { EntityManagerController } from './useEntityManager';
import { t } from '../i18n';
export function EntityRelations({
  entity,
  manager,
  onSelect,
  onSource,
  onPassage,
}: {
  entity: EntityIdentity;
  manager: EntityManagerController;
  onSelect: (id: string) => void;
  onSource: (id: string) => void;
  onPassage: (section: string, node: string | null, quote: string) => void;
}) {
  const [draft, setDraft] = useState<EntityRelation | null>(null);
  const relations = manager.catalog.relations.filter(
    (r) => r.from === entity.id || r.to === entity.id,
  );
  return (
    <section className="entity-relations">
      <h2>{t('Relations')}</h2>
      {relations.map((r) => (
        <div key={r.id} className="entity-relation">
          <button onClick={() => onSelect(r.from === entity.id ? r.to : r.from)}>
            {r.from === entity.id ? '→' : '←'} {r.name} ·{' '}
            {
              manager.catalog.entities.find((e) => e.id === (r.from === entity.id ? r.to : r.from))
                ?.title
            }
          </button>
          <small>
            {t(r.status === 'confirmed' ? 'Confirmée' : 'Proposée')}
            {r.provenance ? ' · ' + t('Sourcée') : ''}
          </small>
          {r.provenance?.quote && <blockquote>{r.provenance.quote}</blockquote>}
          {r.provenance?.source && (
            <button onClick={() => onSource(r.provenance!.source!)}>
              {t('Ouvrir la provenance')}
            </button>
          )}
          {r.provenance?.section && (
            <button
              onClick={() =>
                onPassage(r.provenance!.section!, r.provenance!.node ?? null, r.provenance!.quote)
              }
            >
              {t('Ouvrir le passage')}
            </button>
          )}
          <button disabled={manager.busy} onClick={() => setDraft(structuredClone(r))}>
            {t('Modifier')}
          </button>
          <button
            disabled={manager.busy}
            onClick={() =>
              void manager.apply({ action: 'removeRelation', id: r.id }).catch(() => {})
            }
          >
            {t('Retirer')}
          </button>
        </div>
      ))}
      {!draft ? (
        <button
          onClick={() =>
            setDraft({
              id: crypto.randomUUID(),
              from: entity.id,
              to: '',
              name: '',
              status: 'confirmed',
              provenance: null,
            })
          }
        >
          {t('Ajouter une relation')}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void manager
              .apply({ action: 'relation', relation: draft })
              .then(() => setDraft(null))
              .catch(() => {});
          }}
        >
          <label>
            {t('Relation nommée')}
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            {t('Destination')}
            <select
              required
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            >
              <option value="">{t('Choisir une entité')}</option>
              {manager.catalog.entities
                .filter((e) => !e.redirect)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.kind} · {e.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t('Statut')}
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as 'confirmed' | 'proposed' })
              }
            >
              <option value="confirmed">{t('Confirmée')}</option>
              <option value="proposed">{t('Proposée')}</option>
            </select>
          </label>
          <label>
            {t('Provenance documentaire')}
            <select
              value={draft.provenance?.source ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  provenance: e.target.value
                    ? {
                        ...draft.provenance,
                        source: e.target.value,
                        quote: draft.provenance?.quote ?? '',
                      }
                    : null,
                })
              }
            >
              <option value="">{t('Sans source')}</option>
              {manager.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Citation ou contexte')}
            <textarea
              value={draft.provenance?.quote ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, provenance: { ...draft.provenance, quote: e.target.value } })
              }
            />
          </label>
          <button disabled={manager.busy || !draft.to}>{t('Enregistrer')}</button>
          <button type="button" onClick={() => setDraft(null)}>
            {t('Annuler')}
          </button>
        </form>
      )}
    </section>
  );
}
