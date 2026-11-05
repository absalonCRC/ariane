import { useMemo, useState } from 'react';
import type { Project } from '../contracts/project';
import type { SmartTag, TagOperation } from '../contracts/smartTags';
import { WorkspaceScreen } from '../components/WorkspaceScreen';
import { t, localizeMessage, useLocale } from '../i18n';
import { nextTagColor, tagUsages } from './model';
import { TagPropertyEditor } from './TagPropertyEditor';
export function TagManager({
  project,
  onOperation,
  onClose,
  onFilter,
  onError,
}: {
  project: Project;
  onOperation: (operation: TagOperation) => Promise<void>;
  onClose: () => void;
  onFilter?: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  useLocale();
  const [draft, setDraft] = useState<SmartTag | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [target, setTarget] = useState(''),
    [assignSection, setAssignSection] = useState('');
  const [removal, setRemoval] = useState(false);
  const tags = project.smartTags ?? [],
    all = [...project.sections, ...(project.trash ?? [])];
  const usage = draft ? tagUsages(all, draft.id) : 0;
  const references = useMemo(
    () =>
      draft
        ? all.flatMap((section) => [
            ...(section.tagIds?.includes(draft.id)
              ? [{ section, node: null as string | null, text: section.title }]
              : []),
            ...(section.outline?.nodes.flatMap((node, i, nodes) =>
              node.tagIds?.includes(draft.id)
                ? [
                    {
                      section,
                      node: node.id as string | null,
                      text: section.text
                        .slice(node.start, nodes[i + 1]?.start ?? section.text.length)
                        .trim(),
                    },
                  ]
                : [],
            ) ?? []),
          ])
        : [],
    [project, draft?.id],
  );
  const run = async (operation: TagOperation) => {
    setBusy(true);
    setError('');
    try {
      await onOperation(operation);
      if (operation.action === 'save') setDraft({ ...operation.tag });
      else if (operation.action !== 'assign') setDraft(null);
      setRemoval(false);
      setTarget('');
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkspaceScreen
      title={t('Smart-tags')}
      onError={onError}
      subtitle={project.name}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="smart-tags-screen"
      capsuleTrail={draft?.name ? ['#' + draft.name] : []}
    >
      <div className="tag-workspace">
        <aside className="tag-catalog" aria-label={t('Smart-tags du projet')}>
          <div className="tag-catalog-heading">
            <span>
              {t('{0} smart-tag{1}', { 0: tags.length, 1: tags.length === 1 ? '' : 's' })}
            </span>
            <button
              disabled={busy}
              onClick={() => {
                setDraft({
                  id: crypto.randomUUID(),
                  name: '',
                  color: nextTagColor(tags),
                  category: '',
                });
                setRemoval(false);
              }}
            >
              {t('Nouveau tag')}
            </button>
          </div>
          <input
            aria-label={t('Rechercher un smart-tag')}
            placeholder={t('Rechercher un smart-tag')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label={t('Catégorie')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t('Toutes les catégories')}</option>
            {[...new Set(tags.map((t) => t.category).filter(Boolean))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="tag-admin-list">
            {tags
              .filter(
                (tag) =>
                  (!category || tag.category === category) &&
                  (tag.name + ' ' + tag.category).toLowerCase().includes(query.toLowerCase()),
              )
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((tag) => (
                <button
                  key={tag.id}
                  disabled={busy}
                  aria-current={draft?.id === tag.id ? 'true' : undefined}
                  onClick={() => {
                    setDraft({ ...tag });
                    setRemoval(false);
                    setTarget('');
                  }}
                >
                  <span
                    className="smart-tag"
                    style={{ '--tag-color': tag.color } as React.CSSProperties}
                  >
                    #{tag.name}
                  </span>
                  <small>
                    {tag.category || t('Sans catégorie')} · {tagUsages(all, tag.id)}
                  </small>
                </button>
              ))}
          </div>
          <p className="hint">
            {t(
              'Écrivez #histoire dans le manuscrit pour créer ou retrouver un tag automatiquement.',
            )}
          </p>
        </aside>
        <section className="tag-details" aria-label={t('Administration du smart-tag')}>
          {!draft ? (
            <div className="tag-manager-empty">
              <h2>{t('Des repères pour votre écriture')}</h2>
              <p>
                {t(
                  'Sélectionnez un tag pour modifier son nom, sa couleur, sa catégorie et ses affectations.',
                )}
              </p>
              <p className="hint">
                {t(
                  'Les tags organisent les textes sans apparaître dans les exports. Les tags des sources restent distincts.',
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="tag-detail-heading">
                <h2 style={{ color: draft.color }}>#{draft.name || t('Nouveau tag')}</h2>
                {tags.some((tag) => tag.id === draft.id) && onFilter && (
                  <button disabled={busy} onClick={() => onFilter(draft.id)}>
                    {t('Voir les passages dans le texte')}
                  </button>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({ action: 'save', tag: draft });
                }}
              >
                <label>
                  {t('Nom du smart-tag')}
                  <input
                    required
                    maxLength={80}
                    disabled={busy}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <div className="form-columns">
                  <label>
                    {t('Catégorie')}
                    <input
                      maxLength={80}
                      disabled={busy}
                      list="smart-tag-categories"
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    />
                    <datalist id="smart-tag-categories">
                      {[...new Set(tags.map((t) => t.category))].filter(Boolean).map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    {t('Couleur')}
                    <input
                      type="color"
                      disabled={busy}
                      value={draft.color}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                  </label>
                </div>
                <TagPropertyEditor
                  project={project}
                  fields={draft.properties ?? []}
                  disabled={busy}
                  onChange={(properties) => setDraft({ ...draft, properties })}
                />
                <div className="dialog-actions">
                  <button className="primary" disabled={busy || !draft.name.trim()}>
                    {t('Enregistrer')}
                  </button>
                </div>
              </form>
              {tags.some((tag) => tag.id === draft.id) && (
                <>
                  <h3>
                    {t('Affectations')} <small>{usage}</small>
                  </h3>
                  <p className="hint">
                    {t(
                      'Les affectations directes transmettent le tag à leurs descendants. La corbeille est incluse ci-dessous.',
                    )}
                  </p>
                  <div className="tag-assignment-list">
                    {references.map(({ section, node, text }) => (
                      <div key={section.id + ':' + node}>
                        <div>
                          <strong>
                            {section.title}
                            {section.trashed ? ' · ' + t('Corbeille') : ''}
                          </strong>
                          <p>
                            {node
                              ? text || t('Passage vide')
                              : t('Tout ce texte et ses descendants')}
                          </p>
                        </div>
                        <button
                          disabled={busy}
                          aria-label={t('Retirer cette affectation')}
                          onClick={() => {
                            const ids = node
                              ? section.outline?.nodes.find((n) => n.id === node)?.tagIds
                              : section.tagIds;
                            void run({
                              action: 'assign',
                              section: section.id,
                              node,
                              tagIds: (ids ?? []).filter((id) => id !== draft.id),
                            });
                          }}
                        >
                          {t('Retirer')}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="tag-assign-text">
                    <label>
                      {t('Affecter à un texte')}
                      <select
                        value={assignSection}
                        disabled={busy}
                        onChange={(e) => setAssignSection(e.target.value)}
                      >
                        <option value="">{t('Choisir un texte')}</option>
                        {project.sections
                          .filter((s) => !s.tagIds?.includes(draft.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      disabled={busy || !assignSection}
                      onClick={() => {
                        const section = project.sections.find((s) => s.id === assignSection);
                        if (section)
                          void run({
                            action: 'assign',
                            section: section.id,
                            tagIds: [...(section.tagIds ?? []), draft.id],
                          });
                      }}
                    >
                      {t('Affecter')}
                    </button>
                  </div>
                  <section className="tag-maintenance">
                    <h3>{t('Fusion et suppression')}</h3>
                    <p className="hint">
                      {t(
                        'Le texte sera conservé. Une version du projet permettra de restaurer les tags précédents.',
                      )}
                    </p>
                    {!removal ? (
                      <button disabled={busy} onClick={() => setRemoval(true)}>
                        {t('Fusionner ou supprimer ce tag')}
                      </button>
                    ) : (
                      <>
                        <p>
                          {t('{0} affectations directes', { 0: usage })} · #{draft.name}
                        </p>
                        <label>
                          {t('Fusionner vers')}
                          <select
                            value={target}
                            disabled={busy}
                            onChange={(e) => setTarget(e.target.value)}
                          >
                            <option value="">{t('Choisir un smart-tag')}</option>
                            {tags
                              .filter((t) => t.id !== draft.id)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  #{t.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="dialog-actions">
                          <button disabled={busy} onClick={() => setRemoval(false)}>
                            {t('Annuler')}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void run({ action: 'delete', id: draft.id })}
                          >
                            {t('Supprimer ce smart-tag')}
                          </button>
                          <button
                            className="primary"
                            disabled={busy || !target}
                            onClick={() => void run({ action: 'merge', id: draft.id, target })}
                          >
                            {t('Fusionner')}
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-text">
              {localizeMessage(error)}
            </p>
          )}
        </section>
      </div>
    </WorkspaceScreen>
  );
}
