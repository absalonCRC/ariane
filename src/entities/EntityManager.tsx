import { useState } from 'react';
import type { Project } from '../contracts/project';
import type { EntityBatch } from '../contracts/entities';
import type { EntityIdentity, EntityMergePreview } from '../contracts/entityIdentity';
import { WorkspaceScreen } from '../components/WorkspaceScreen';
import { request, native } from '../platform/client';
import { t, localizeMessage, useLocale } from '../i18n';
import type { EntityManagerController } from './useEntityManager';
import { identityOccurrences } from './occurrences';
import { EntityRelations } from './EntityRelations';
export function EntityManager({
  project,
  manager,
  batches,
  onClose,
  onError,
  onPassage,
  onSource,
  onChanged,
}: {
  project: Project;
  manager: EntityManagerController;
  batches: EntityBatch[];
  onClose: () => void;
  onError: (e: unknown) => void;
  onPassage: (section: string, node: string | null, quote: string) => void;
  onSource: (id: string) => void;
  onChanged: () => void;
}) {
  useLocale();
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState(''),
    [status, setStatus] = useState(''),
    [draft, setDraft] = useState<EntityIdentity | null>(null),
    [target, setTarget] = useState(''),
    [preview, setPreview] = useState<EntityMergePreview | null>(null),
    [card, setCard] = useState<{
      id: string;
      fingerprint: string;
      title: string;
      kind: string;
      aliases: string;
      body: string;
    } | null>(null);
  const identities = manager.catalog.entities.filter((e) => !e.redirect),
    selected = draft ? manager.catalog.entities.find((e) => e.id === draft.id) : null;
  const candidates = manager.sources.filter(
    (s) => !identities.some((e) => e.sourceIds.includes(s.id)),
  );
  const detected = [
    ...new Map(
      [...batches, ...manager.batches].flatMap((b) =>
        b.mentions.filter((m) => m.entityId && !m.sourceId).map((m) => [m.entityId!, m] as const),
      ),
    ).values(),
  ].filter((m) => !identities.some((e) => e.detectedIds.includes(m.entityId!)));
  const hits = selected
    ? identityOccurrences(
        project,
        manager.catalog,
        selected,
        [...batches, ...manager.batches],
        manager.sources,
      )
    : [];
  const choose = (id: string) => {
    const e = identities.find((e) => e.id === id);
    if (e) {
      setDraft(structuredClone(e));
      setPreview(null);
      setCard(null);
    }
  };
  const create = () =>
    setDraft({
      id: crypto.randomUUID(),
      title: '',
      kind: 'Personne',
      aliases: [],
      sourceIds: [],
      detectedIds: [],
      confirmed: true,
    });
  return (
    <WorkspaceScreen
      title={t('Entités')}
      subtitle={project.name}
      onClose={() => {
        if (!manager.busy) onClose();
      }}
      onError={onError}
      className="entity-manager"
    >
      <div className="entity-workspace">
        <aside>
          <label>
            {t('Rechercher une entité')}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            {t('Type')}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('Tous les types')}</option>
              {[...new Set(identities.map((e) => e.kind))].sort().map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            {t('Statut')}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('Tous les statuts')}</option>
              <option value="confirmed">{t('Confirmée')}</option>
              <option value="detected">{t('Détectée')}</option>
            </select>
          </label>
          <button onClick={create}>{t('Créer une entité')}</button>
          {identities
            .filter(
              (e) =>
                (!kind || e.kind === kind) &&
                (!status || e.confirmed === (status === 'confirmed')) &&
                [e.title, ...e.aliases].some((n) =>
                  n.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                ),
            )
            .map((e) => (
              <button
                key={e.id}
                aria-current={draft?.id === e.id ? 'true' : undefined}
                onClick={() => choose(e.id)}
              >
                <strong>{e.title}</strong>
                <small>
                  {e.kind} · {t(e.confirmed ? 'Confirmée' : 'Détectée')} · {e.id.slice(0, 8)}
                </small>
              </button>
            ))}
          <details>
            <summary>
              {t('Fiches à rattacher')} ({candidates.length})
            </summary>
            {candidates
              .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    setDraft({
                      id: crypto.randomUUID(),
                      title: s.title,
                      kind: s.kind,
                      aliases: s.aliases,
                      sourceIds: [s.id],
                      detectedIds: [],
                      confirmed: false,
                    })
                  }
                >
                  {s.title} ·{' '}
                  {manager.owned.includes(s.vaultId) ? t('Fiche ariane') : t('Source externe')}
                </button>
              ))}
          </details>
          <details>
            <summary>
              {t('Mentions détectées')} ({detected.length})
            </summary>
            {detected.map((m) => (
              <button
                key={m.entityId}
                onClick={() =>
                  setDraft({
                    id: crypto.randomUUID(),
                    title: m.title,
                    kind: m.kind,
                    aliases: [],
                    sourceIds: [],
                    detectedIds: [m.entityId!],
                    confirmed: false,
                  })
                }
              >
                {m.title}
              </button>
            ))}
          </details>
        </aside>
        <div className="entity-detail">
          {manager.error && (
            <p role="alert">
              {localizeMessage(manager.error)}{' '}
              <button onClick={() => void manager.refresh()}>{t('Actualiser')}</button>
            </p>
          )}
          {draft ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void manager
                    .apply({ action: 'save', entity: draft })
                    .then(() => onChanged())
                    .catch(() => {});
                }}
              >
                <label>
                  {t('Nom')}
                  <input
                    required
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </label>
                <label>
                  {t('Type')}
                  <input
                    required
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                  />
                </label>
                <label>
                  {t('Alias')}
                  <input
                    value={draft.aliases.join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        aliases: e.target.value.split(',').map((n) => n.trim()),
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.confirmed}
                    onChange={(e) => setDraft({ ...draft, confirmed: e.target.checked })}
                  />
                  {t('Identité confirmée')}
                </label>
                <button disabled={manager.busy}>{t('Enregistrer')}</button>
              </form>
              {selected && (
                <>
                  <h2>{t('Fiches et sources')}</h2>
                  {selected.sourceIds.map((id) => {
                    const s = manager.sources.find((s) => s.id === id);
                    return (
                      <div key={id}>
                        {s ? (
                          <>
                            <button onClick={() => onSource(id)}>
                              {s.title} ·{' '}
                              {manager.owned.includes(s.vaultId)
                                ? t('Fiche ariane')
                                : t('Source externe')}
                            </button>
                            {manager.owned.includes(s.vaultId) && (
                              <button
                                onClick={() =>
                                  void manager
                                    .run(() => request('source', { id: s.id }))
                                    .then((full) => {
                                      if (full)
                                        setCard({
                                          id: full.id,
                                          fingerprint: full.fingerprint,
                                          title: full.title,
                                          kind: full.kind,
                                          aliases: full.aliases.join(', '),
                                          body: full.text,
                                        });
                                    })
                                    .catch(() => {})
                                }
                              >
                                {t('Modifier la fiche')}
                              </button>
                            )}
                          </>
                        ) : (
                          <p>{t('Source introuvable')}</p>
                        )}
                      </div>
                    );
                  })}
                  <label>
                    {t('Rattacher une fiche existante')}
                    <select
                      value=""
                      disabled={manager.busy}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id)
                          void manager
                            .apply({
                              action: 'save',
                              entity: { ...selected, sourceIds: [...selected.sourceIds, id] },
                            })
                            .then((result) => {
                              if (result)
                                setDraft(result.entities.find((e) => e.id === selected.id) ?? null);
                              onChanged();
                            })
                            .catch(() => {});
                      }}
                    >
                      <option value="">{t('Choisir une fiche')}</option>
                      {manager.sources
                        .filter((s) => !selected.sourceIds.includes(s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} · {s.kind} · {s.path}
                          </option>
                        ))}
                    </select>
                  </label>
                  {!selected.sourceIds.length && (
                    <button
                      disabled={manager.busy}
                      onClick={() =>
                        void manager
                          .run(async () => {
                            const fileTitle = manager.sources.some(
                              (s) => s.title === selected.title,
                            )
                              ? selected.title + ' — ' + selected.id.slice(0, 8)
                              : selected.title;
                            const result = await request('createVaultEntity', {
                              kind: 'note',
                              name: fileTitle,
                              description: '',
                            });
                            const all = await request('browseSources', {
                              query: fileTitle,
                              offset: 0,
                            });
                            const source = all.items.find(
                              (s) => s.path === result.path || s.title === fileTitle,
                            );
                            if (!source) throw Error('Source introuvable');
                            if (source.title !== selected.title)
                              await request('updateSourceCard', {
                                projectPath: project.path,
                                source: source.id,
                                fingerprint: source.fingerprint,
                                title: selected.title,
                                kind: selected.kind,
                                aliases: selected.aliases,
                                body: source.text,
                              });
                            await request('entityOperation', {
                              projectPath: project.path,
                              revision: manager.catalog.revision,
                              operation: {
                                action: 'save',
                                entity: { ...selected, sourceIds: [source.id] },
                              },
                            });
                            onChanged();
                          })
                          .catch(() => {})
                      }
                    >
                      {t('Créer une fiche ariane')}
                    </button>
                  )}
                  {card && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void manager
                          .run(() =>
                            request('updateSourceCard', {
                              projectPath: project.path,
                              source: card.id,
                              fingerprint: card.fingerprint,
                              title: card.title,
                              kind: card.kind,
                              aliases: card.aliases
                                .split(',')
                                .map((a) => a.trim())
                                .filter(Boolean),
                              body: card.body,
                            }),
                          )
                          .then(() => {
                            setCard(null);
                            onChanged();
                          })
                          .catch(() => {});
                      }}
                    >
                      <h3>{t('Modifier la fiche')}</h3>
                      <label>
                        {t('Nom')}
                        <input
                          required
                          value={card.title}
                          onChange={(e) => setCard({ ...card, title: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('Type')}
                        <input
                          required
                          value={card.kind}
                          onChange={(e) => setCard({ ...card, kind: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('Alias')}
                        <input
                          value={card.aliases}
                          onChange={(e) => setCard({ ...card, aliases: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('Contenu')}
                        <textarea
                          value={card.body}
                          onChange={(e) => setCard({ ...card, body: e.target.value })}
                        />
                      </label>
                      <button disabled={manager.busy}>{t('Enregistrer la fiche')}</button>
                      <button type="button" onClick={() => setCard(null)}>
                        {t('Annuler')}
                      </button>
                    </form>
                  )}
                  <h2>{t('Occurrences')}</h2>
                  {hits.map((h) => (
                    <div key={h.key}>
                      <button onClick={() => onPassage(h.section, h.node, h.matched)}>
                        {h.title} · {h.excerpt}
                      </button>
                      {h.ambiguous && (
                        <>
                          <small>{t('Homonyme à résoudre')}</small>
                          {native && selected.sourceIds.length === 1 && (
                            <button
                              disabled={manager.busy}
                              onClick={() =>
                                void manager
                                  .run(() =>
                                    request('resolveDetectedEntity', {
                                      projectPath: project.path,
                                      section: h.section,
                                      revision: project.sections.find((s) => s.id === h.section)!
                                        .revision,
                                      from: h.from,
                                      to: h.to,
                                      source: selected.sourceIds[0],
                                    }),
                                  )
                                  .then(onChanged)
                                  .catch(() => {})
                              }
                            >
                              {t('Associer cette mention')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <EntityRelations
                    key={selected.id}
                    entity={selected}
                    manager={manager}
                    onSelect={choose}
                    onSource={onSource}
                    onPassage={onPassage}
                  />
                  <h2>{t('Fusion manuelle')}</h2>
                  <select
                    aria-label={t('Identité conservée')}
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="">{t('Choisir une entité')}</option>
                    {identities
                      .filter((e) => e.id !== selected.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} · {e.kind} · {e.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={!target || manager.busy}
                    onClick={() =>
                      void manager
                        .run(() =>
                          request('entityMergePreview', {
                            projectPath: project.path,
                            source: selected.id,
                            target,
                          }),
                        )
                        .then((v) => {
                          if (v) setPreview(v);
                        })
                        .catch(() => {})
                    }
                  >
                    {t('Prévisualiser la fusion')}
                  </button>
                  {preview && (
                    <div className="entity-merge-preview">
                      <p>
                        {preview.source.title} → {preview.target.title}
                      </p>
                      <p>
                        {t(
                          'Les fiches originales sont conservées. Les alias et références seront réunis.',
                        )}
                      </p>
                      <p>
                        {t('Alias')} :{' '}
                        {[
                          preview.source.title,
                          ...preview.source.aliases,
                          ...preview.target.aliases,
                        ].join(', ')}
                      </p>
                      <p>
                        {t('Relations')} : {preview.relations.length}
                      </p>
                      <p>
                        {t('Fiches et sources')} :{' '}
                        {[...preview.source.sourceIds, ...preview.target.sourceIds]
                          .map((id) => manager.sources.find((s) => s.id === id)?.title ?? id)
                          .join(', ')}
                      </p>
                      <p>
                        {t('Occurrences')} :{' '}
                        {
                          identityOccurrences(
                            project,
                            manager.catalog,
                            preview.source,
                            [...batches, ...manager.batches],
                            manager.sources,
                          ).length
                        }{' '}
                        →{' '}
                        {
                          identityOccurrences(
                            project,
                            manager.catalog,
                            preview.target,
                            [...batches, ...manager.batches],
                            manager.sources,
                          ).length
                        }
                      </p>
                      <p>
                        {t('Type conservé')} : {preview.target.kind}
                      </p>
                      <p>
                        {t('Vues concernées')} :{' '}
                        {manager.views
                          .filter((v) =>
                            v.query.groups.some((g) =>
                              g.some(
                                (t) =>
                                  t.kind === 'entity' &&
                                  [preview.source.id, preview.target.id].includes(t.id),
                              ),
                            ),
                          )
                          .map((v) => v.name)
                          .join(', ') || '0'}
                      </p>
                      {preview.relations.map((r) => (
                        <p key={r.id}>
                          {r.name} · {t(r.status === 'confirmed' ? 'Confirmée' : 'Proposée')}
                          {r.provenance ? ' · ' + t('Sourcée') : ''}
                        </p>
                      ))}
                      <button
                        disabled={manager.busy}
                        onClick={() =>
                          void manager
                            .apply({
                              action: 'merge',
                              source: preview.source.id,
                              target: preview.target.id,
                              token: preview.token,
                            })
                            .then(() => {
                              setDraft(null);
                              setPreview(null);
                              onChanged();
                            })
                            .catch(() => {})
                        }
                      >
                        {t('Confirmer la fusion')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <p>{t('Choisissez une entité ou créez-en une.')}</p>
          )}
          <details>
            <summary>{t('Fusions précédentes')}</summary>
            {manager.merges
              .filter((m) => !m.undone)
              .map((m) => (
                <button
                  key={m.id}
                  disabled={manager.busy}
                  onClick={() =>
                    void manager
                      .apply({ action: 'undoMerge', id: m.id })
                      .then(() => {
                        setDraft(null);
                        onChanged();
                      })
                      .catch(() => {})
                  }
                >
                  {t('Annuler la fusion')} ·{' '}
                  {manager.catalog.entities.find((e) => e.id === m.source)?.title} →{' '}
                  {manager.catalog.entities.find((e) => e.id === m.target)?.title}
                </button>
              ))}
          </details>
        </div>
      </div>
    </WorkspaceScreen>
  );
}
