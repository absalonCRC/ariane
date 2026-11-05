import { comparePassages, readingWords, reprisePassage, sectionChanges } from './comparison';
import { ReadingDiff } from './ReadingDiff';
import { useEffect, useState } from 'react';
import { request } from '../platform/client';
import type {
  HistoryState,
  MergeEntry,
  MergePreview,
  MergeResolution,
  Version,
} from '../contracts/history';
import type { Project } from '../contracts/project';
import { localizeMessage, t } from '../i18n';
import { versionDate } from './VersionTimeline';

function selectedText(entry: MergeEntry, passages: Record<string, boolean>): string {
  if (!entry.current || !entry.result) return entry.result?.text ?? '';
  const rows = comparePassages(entry.current.text, entry.result.text);
  let text = entry.result.text;
  for (let index = rows.length - 1; index >= 0; index--)
    if (passages[`${entry.id}:${index}`] === false) text = reprisePassage(text, rows[index]);
  return text;
}

function reviewText(
  entry: MergeEntry,
  passages: Record<string, boolean>,
  included: boolean,
): string {
  if (entry.conflict) return entry.incoming?.text ?? '';
  return included ? selectedText(entry, passages) : (entry.current?.text ?? '');
}

export function Variants(p: {
  project: Project;
  state: HistoryState;
  busy: boolean;
  flush: () => Promise<void>;
  onSwitch: (id: string) => Promise<void>;
  onChanged: (project: Project) => Promise<void>;
  fromVersion: Version | null;
  onClearOrigin: () => void;
  onWrite?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    p.onBusyChange?.(busy);
  }, [busy, p.onBusyChange]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, MergeResolution>>({});
  const [passages, setPassages] = useState<Record<string, boolean>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await p.flush();
      const next = await request('createBranch', {
        projectPath: p.project.path,
        name: name.trim(),
        fromVersion: p.fromVersion?.id ?? null,
      });
      await p.onChanged(next);
      setName('');
      p.onClearOrigin();
      setNotice(t('Variante créée. Vous pouvez reprendre l’écriture.'));
      p.onWrite?.();
    } catch (e) {
      setError(localizeMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await p.flush();
      setPreview(await request('mergePreview', { projectPath: p.project.path, source: id }));
      setChoices({});
      setIncluded({});
      setPassages({});
    } catch (e) {
      setError(localizeMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string, choice: MergeResolution['choice'], text?: string) {
    setChoices((old) => ({ ...old, [id]: { id, choice, text } }));
  }
  async function integrate() {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      await p.flush();
      const resolutions = Object.values(choices);
      for (const entry of preview.entries.filter((e) => e.changed && !e.conflict)) {
        if (included[entry.id] === false) resolutions.push({ id: entry.id, choice: 'current' });
        else if (entry.current && entry.result) {
          const rows = comparePassages(entry.current.text, entry.result.text);
          if (rows.some((_, index) => passages[`${entry.id}:${index}`] === false))
            resolutions.push({
              id: entry.id,
              choice: 'custom',
              text: selectedText(entry, passages),
            });
        }
      }
      const next = await request('mergeBranch', {
        projectPath: p.project.path,
        source: preview.source.id,
        token: preview.token,
        resolutions,
      });
      await p.onChanged(next);
      setPreview(null);
      setNotice(t('Variante intégrée. L’état précédent est disponible dans l’historique.'));
    } catch (e) {
      setError(localizeMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || p.busy;
  const unresolved = preview
    ? [
        ...preview.entries.filter((e) => e.conflict).map((e) => e.id),
        ...preview.auxiliaryConflicts.map((e) => e.id),
      ].filter((id) => !choices[id]).length
    : 0;
  return (
    <section className="writing-variants" aria-label={t('Variantes du texte')}>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="history-help">
          {notice}
        </p>
      )}
      {preview ? (
        <>
          <div className="merge-heading">
            <div>
              <p className="history-eyebrow">{t('Relecture avant intégration')}</p>
              <h2>
                {preview.source.name} <span>→ {t('Texte principal')}</span>
              </h2>
            </div>
            <button disabled={disabled} onClick={() => setPreview(null)}>
              {t('Revenir aux variantes')}
            </button>
          </div>
          <p className="history-help">
            {t(
              'Relisez les changements. Les passages modifiés des deux côtés demandent votre choix.',
            )}
          </p>
          <div className="merge-review-scroll">
            {!!preview.auxiliaryChanges && (
              <p className="history-help">
                {t('{0} changements de références ou de réglages seront également intégrés.', {
                  0: preview.auxiliaryChanges,
                })}
              </p>
            )}
            {preview.entries
              .filter((e) => e.changed)
              .map((entry) => (
                <section className="merge-entry" key={entry.id}>
                  <div className="merge-entry-heading">
                    <h3>{entry.title}</h3>
                    {entry.conflict ? (
                      <span>{t('À départager')}</span>
                    ) : (
                      <label>
                        <input
                          type="checkbox"
                          checked={included[entry.id] !== false}
                          onChange={(e) =>
                            setIncluded((old) => ({ ...old, [entry.id]: e.target.checked }))
                          }
                        />
                        {t('Intégrer ce changement')}
                      </label>
                    )}
                  </div>
                  {entry.fields.some((f) => f !== 'text' && f !== 'outline') && (
                    <p className="history-help">
                      {t(
                        'Changement de structure ou de préparation : votre choix porte sur toute la scène.',
                      )}
                    </p>
                  )}
                  {entry.conflict && (
                    <details className="merge-origin">
                      <summary>{t('Voir le texte d’origine')}</summary>
                      <p>{entry.base?.text ?? t('Texte absent')}</p>
                    </details>
                  )}
                  <p className="history-help">
                    {sectionChanges(
                      entry.current ?? undefined,
                      entry.result ?? entry.incoming ?? undefined,
                    ).join(' · ')}
                  </p>
                  <div className="merge-prose-pair">
                    <div>
                      <h4>{t('Texte principal')}</h4>
                      <div className="diff-prose is-reading">
                        <ReadingDiff
                          words={readingWords(
                            comparePassages(
                              entry.current?.text ?? '',
                              reviewText(entry, passages, included[entry.id] !== false),
                            ),
                          )}
                          side="left"
                        />
                      </div>
                    </div>
                    <div>
                      <h4>{entry.conflict ? t('Variante') : t('Résultat proposé')}</h4>
                      <div className="diff-prose is-reading">
                        <ReadingDiff
                          words={readingWords(
                            comparePassages(
                              entry.current?.text ?? '',
                              reviewText(entry, passages, included[entry.id] !== false),
                            ),
                          )}
                          side="right"
                        />
                      </div>
                    </div>
                  </div>
                  {!entry.conflict &&
                    entry.current &&
                    entry.result &&
                    included[entry.id] !== false && (
                      <fieldset className="merge-passages" disabled={disabled}>
                        <legend>{t('Passages à intégrer')}</legend>
                        {comparePassages(entry.current.text, entry.result.text).map(
                          (row, index) =>
                            row.changed && (
                              <label key={index}>
                                <input
                                  type="checkbox"
                                  checked={passages[`${entry.id}:${index}`] !== false}
                                  onChange={(e) =>
                                    setPassages((old) => ({
                                      ...old,
                                      [`${entry.id}:${index}`]: e.target.checked,
                                    }))
                                  }
                                />
                                <span>
                                  {row.right.join(' ').slice(0, 130) || t('Retrait du passage')}
                                </span>
                              </label>
                            ),
                        )}
                      </fieldset>
                    )}
                  {entry.conflict && (
                    <fieldset className="merge-choices" disabled={disabled}>
                      <legend>{t('Résoudre cette divergence')}</legend>
                      <label>
                        <input
                          type="radio"
                          name={'merge-' + entry.id}
                          checked={choices[entry.id]?.choice === 'current'}
                          onChange={() => choose(entry.id, 'current')}
                        />
                        {t('Garder le texte principal')}
                      </label>
                      <label>
                        <input
                          type="radio"
                          name={'merge-' + entry.id}
                          checked={choices[entry.id]?.choice === 'incoming'}
                          onChange={() => choose(entry.id, 'incoming')}
                        />
                        {t('Reprendre la variante')}
                      </label>
                      {entry.result &&
                        entry.fields.every((f) => f === 'text' || f === 'outline') && (
                          <label>
                            <input
                              type="radio"
                              name={'merge-' + entry.id}
                              checked={choices[entry.id]?.choice === 'custom'}
                              onChange={() => choose(entry.id, 'custom', entry.result?.text ?? '')}
                            />
                            {t('Réécrire ce passage')}
                          </label>
                        )}
                    </fieldset>
                  )}
                  {choices[entry.id]?.choice === 'custom' && (
                    <label className="merge-rewrite">
                      {t('Passage réécrit')}
                      <textarea
                        value={choices[entry.id].text ?? ''}
                        onChange={(e) => choose(entry.id, 'custom', e.target.value)}
                      />
                    </label>
                  )}
                </section>
              ))}
            {preview.auxiliaryConflicts.map((conflict) => (
              <fieldset className="merge-entry merge-choices" key={conflict.id} disabled={disabled}>
                <legend>{t(conflict.label)}</legend>
                <label>
                  <input
                    type="radio"
                    name={'merge-' + conflict.id}
                    checked={choices[conflict.id]?.choice === 'current'}
                    onChange={() => choose(conflict.id, 'current')}
                  />
                  {t('Garder le texte principal')}
                  <small>{readableReference(conflict.current)}</small>
                </label>
                <label>
                  <input
                    type="radio"
                    name={'merge-' + conflict.id}
                    checked={choices[conflict.id]?.choice === 'incoming'}
                    onChange={() => choose(conflict.id, 'incoming')}
                  />
                  {t('Reprendre la variante')}
                  <small>{readableReference(conflict.incoming)}</small>
                </label>
              </fieldset>
            ))}
            {!preview.entries.some((e) => e.changed) &&
              !preview.auxiliaryConflicts.length &&
              !preview.auxiliaryChanges && (
                <p className="history-empty">{t('Aucun changement à intégrer.')}</p>
              )}
          </div>
          <footer className="merge-footer">
            <span role="status">
              {unresolved
                ? t('{0} divergence{1} à départager', {
                    0: unresolved,
                    1: unresolved > 1 ? 's' : '',
                  })
                : t('Relecture prête')}
            </span>
            <button disabled={disabled} onClick={() => void review(preview.source.id)}>
              {t('Actualiser la comparaison')}
            </button>
            <button
              className="history-primary"
              disabled={
                disabled ||
                unresolved > 0 ||
                (!preview.entries.some((e) => e.changed) &&
                  !preview.auxiliaryConflicts.length &&
                  !preview.auxiliaryChanges)
              }
              onClick={() => void integrate()}
            >
              {t('Intégrer au texte principal')}
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="variants-intro">
            <h2>{t('Explorer une autre direction')}</h2>
            <p>
              {t(
                'Chaque variante garde son brouillon et ses sauvegardes automatiques. Vous pourrez relire ses changements avant de les intégrer.',
              )}
            </p>
          </div>
          <form className="variant-create" onSubmit={(e) => void create(e)}>
            <label>
              {t('Nom de la variante')}
              <input
                required
                placeholder={t('Une fin plus ouverte…')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={disabled}
              />
            </label>
            <button className="history-primary" disabled={disabled || !name.trim()}>
              {t('Créer et écrire')}
            </button>
          </form>
          {p.fromVersion && (
            <p className="history-help">
              {t('À partir de « {0} »', { 0: p.fromVersion.name })}{' '}
              <button onClick={p.onClearOrigin}>{t('Utiliser le texte actuel')}</button>
            </p>
          )}
          <div className="variants-list">
            {p.state.branches.map((branch) => (
              <div className="variant-row" key={branch.id}>
                <div>
                  <h3>{branch.isMain ? t('Texte principal') : branch.name}</h3>
                  <small>
                    {branch.id === p.state.activeBranch
                      ? t('Vous écrivez ici')
                      : versionDate(branch.created)}
                  </small>
                </div>
                <button
                  disabled={disabled || branch.id === p.state.activeBranch}
                  onClick={() => void p.onSwitch(branch.id)}
                >
                  {t('Ouvrir')}
                </button>
                {!branch.isMain && (
                  <button disabled={disabled} onClick={() => void review(branch.id)}>
                    {t('Relire et intégrer')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function readableReference(raw: string): string {
  let value: unknown = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  if (value === null) return t('Texte absent');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    for (const key of ['title', 'name', 'note', 'text'])
      if (typeof item[key] === 'string') return item[key];
    if (Array.isArray(value))
      return value
        .map((v) => (typeof v === 'object' && v && 'title' in v ? String(v.title) : '…'))
        .join(', ');
    return t('Référence du texte');
  }
  return String(value);
}
