import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { request } from '../app/client';
import type { Project, Version } from '../app/types';
import { Plus, ArrowDown, ArrowUp, ArrowRight, ArrowLeft, X } from 'lucide-react';
import { comparePassages, reprisePassage, sectionChanges } from './comparison';
import { descendants } from '../project/tree';
import '../styles/history-refinements.css';

const comparisonMarkdown: Components = {
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span>{alt || 'Image'}</span>,
};

function versionLabel(version: Version) {
  const created = new Date(version.created);
  const date = Number.isNaN(created.getTime())
    ? version.created
    : new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(created);
  return `${version.name} · ${date}`;
}
interface Props {
  project: Project;
  active: string | null;
  onClose: () => void;
  flush: () => Promise<void>;
  onRestore: (p: Project) => void;
  onApply: (id: string, text: string, revision: number) => Promise<void>;
  onError: (e: unknown) => void;
  onSelectText?: (id: string) => void;
  toolsHost?: HTMLElement | null;
  toolsOpen?: boolean;
  onCloseTools?: () => void;
}
export function History(p: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('current');
  const [loaded, setLoaded] = useState<{ left: Version | null; right: Version | null }>({
    left: null,
    right: null,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState('project');
  const [scene, setScene] = useState(
    p.project.sections.find((s) => s.id === p.active && s.kind === 'scene')?.id ??
      p.project.sections.find((s) => s.kind === 'scene')?.id ??
      '',
  );
  useEffect(() => {
    if (!p.active) return;
    const activeScene = descendants(p.project.sections, p.active).find((s) => s.kind === 'scene');
    if (activeScene) setScene(activeScene.id);
  }, [p.active, p.project.sections]);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [view, setView] = useState<'source' | 'reading'>('source');
  const [confirm, setConfirm] = useState<Version | null>(null);
  const [changeIndex, setChangeIndex] = useState(-1);
  const diffRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void p
      .flush()
      .then(() => request<Version[]>('versions'))
      .then((values) => {
        if (alive) {
          setVersions(values);
          setLeftId(values[0]?.id ?? 'current');
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [p.project.path]);
  useEffect(() => {
    if (!leftId) return;
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      leftId === 'current' ? null : request<Version>('version', { id: leftId }),
      rightId === 'current' ? null : request<Version>('version', { id: rightId }),
    ])
      .then(([left, right]) => {
        if (alive) setLoaded({ left, right });
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [leftId, rightId, p.project.path]);
  const incompatible =
    loaded.left?.scope && loaded.right?.scope && loaded.left.scope !== loaded.right.scope;
  const entries = useMemo(() => {
    let left = (loaded.left?.sections ?? p.project.sections).filter((s) => !s.trashed);
    let right = (loaded.right?.sections ?? p.project.sections).filter((s) => !s.trashed);
    const selectedScope = loaded.left?.scope || loaded.right?.scope;
    if (selectedScope) {
      left = descendants(left, selectedScope);
      right = descendants(right, selectedScope);
    }
    const ids = [...new Set([...left, ...right].map((s) => s.id))];
    return ids.map((id) => {
      const a = left.find((s) => s.id === id),
        b = right.find((s) => s.id === id);
      return {
        id,
        left: a,
        right: b,
        title: b?.title || a?.title || 'Sans titre',
        changed: !a || !b || a.text !== b.text || sectionChanges(a, b).length > 0,
      };
    });
  }, [loaded, p.project.sections]);
  const visible = entries.filter((e) => !onlyChanged || e.changed);
  const selected = visible.find((e) => e.id === scene) ?? visible[0];
  const metadata = sectionChanges(selected?.left, selected?.right);
  const rows = useMemo(
    () => comparePassages(selected?.left?.text ?? '', selected?.right?.text ?? ''),
    [selected?.left?.text, selected?.right?.text],
  );
  const changes = rows.flatMap((r, i) => (r.changed ? [i] : []));
  const added = rows.reduce(
    (n, r) =>
      n +
      r.words
        .filter((w) => w.added)
        .reduce((sum, w) => sum + (w.value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0),
    0,
  );
  const removed = rows.reduce(
    (n, r) =>
      n +
      r.words
        .filter((w) => w.removed)
        .reduce((sum, w) => sum + (w.value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0),
    0,
  );
  useEffect(() => {
    setChangeIndex(-1);
    if (diffRef.current) diffRef.current.scrollTop = 0;
  }, [selected?.id, leftId, rightId]);
  async function capture() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await p.flush();
      const version = await request<Version>('capture', {
        name: name.trim(),
        scope: scope === 'project' ? null : p.active,
      });
      setVersions(await request('versions'));
      setLeftId(version.id);
      setRightId('current');
      setName('');
      setCreating(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      await p.flush();
      p.onRestore(await request<Project>('restore', { id: confirm.id }));
      p.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply(index: number) {
    const live = p.project.sections.find((s) => s.id === selected?.id);
    if (!live || rightId !== 'current' || busy) return;
    setBusy(true);
    setError('');
    try {
      const revision = live.revision;
      await p.flush();
      await request('capture', { name: 'Avant reprise de passage', scope: live.id });
      await p.onApply(live.id, reprisePassage(live.text, rows[index]), revision);
      setVersions(await request('versions'));
      setChangeIndex(-1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function nextChange(direction: number) {
    if (!changes.length) return;
    const next =
      changeIndex < 0
        ? direction > 0
          ? 0
          : changes.length - 1
        : (changeIndex + direction + changes.length) % changes.length;
    setChangeIndex(next);
    diffRef.current
      ?.querySelector<HTMLElement>(`[data-change="${changes[next]}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  return (
    <section className="history-editor" aria-label="Versions du texte" data-view={view}>
      {p.toolsHost &&
        createPortal(
          <section
            id="version-settings"
            className="settings floating version-settings"
            aria-label="Outils des versions"
            aria-hidden={!p.toolsOpen}
            inert={!p.toolsOpen}
          >
            <div className="panel-top">
              <h2>Versions</h2>
              <button
                className="icon-button"
                aria-label="Fermer les outils des versions"
                onClick={p.onCloseTools}
              >
                <X size={15} />
              </button>
            </div>
            <button
              className="version-tool-action"
              disabled={busy}
              onClick={() => {
                setCreating(true);
                p.onCloseTools?.();
              }}
            >
              <Plus size={14} /> Conserver une version
            </button>
            <label className="settings-row version-filter">
              <span className="settings-label">Textes modifiés uniquement</span>
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(e) => setOnlyChanged(e.target.checked)}
              />
            </label>
            <button
              className="version-tool-action"
              disabled={busy || loading || !loaded.left}
              onClick={() => {
                setConfirm(loaded.left);
                p.onCloseTools?.();
              }}
            >
              Restaurer cette version…
            </button>
            <p className="version-tools-hint">
              Une sauvegarde est conservée avant chaque reprise ou restauration.
            </p>
          </section>,
          p.toolsHost,
        )}
      <header className="history-modebar">
        <button onClick={p.onClose}>
          <ArrowLeft size={13} /> Revenir au texte
        </button>
        <span>Versions du texte</span>
      </header>
      <div className="history-capture">
        {' '}
        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void capture();
            }}
          >
            <label>
              Nom
              <input
                required
                autoFocus
                placeholder="Avant révision, autre début…"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Portée
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="project">Tout le projet</option>
                {p.active && <option value="section">Section actuelle et ses scènes</option>}
              </select>
            </label>
            <button className="history-save" disabled={busy || !name.trim()}>
              <Plus size={14} />
              Conserver
            </button>
            <button
              type="button"
              className="history-create-cancel"
              onClick={() => setCreating(false)}
            >
              Annuler
            </button>
          </form>
        )}
      </div>
      <div className="history-workspace">
        <section className="history-comparison" aria-label="Comparaison des versions">
          {!loading && !versions.length && !error ? (
            <div className="history-first-version">
              <h2>Aucune version enregistrée</h2>
              <p>
                Conservez un état du texte pour comparer vos révisions côte à côte et reprendre les
                passages de votre choix.
              </p>
              <button onClick={() => setCreating(true)}>
                <Plus size={14} /> Conserver la première version
              </button>
            </div>
          ) : (
            <>
              <div className="history-controls">
                <label>
                  Version de référence
                  <select
                    aria-label="Version de référence"
                    value={leftId}
                    disabled={busy || !leftId}
                    onChange={(e) => setLeftId(e.target.value)}
                  >
                    <option value="current">Texte actuel</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {versionLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Comparer avec
                  <select
                    aria-label="Version comparée"
                    value={rightId}
                    disabled={busy}
                    onChange={(e) => setRightId(e.target.value)}
                  >
                    <option value="current">Texte actuel</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {versionLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="history-diff-summary">
                <div className="history-diff-identity">
                  <select
                    className="history-scene-title"
                    aria-label="Texte comparé"
                    value={selected?.id ?? ''}
                    onChange={(e) => {
                      setScene(e.target.value);
                      if (p.project.sections.some((s) => s.id === e.target.value))
                        p.onSelectText?.(e.target.value);
                    }}
                  >
                    {!visible.length && <option value="">Aucun texte</option>}
                    {visible.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                        {!e.left ? ' · Ajouté' : !e.right ? ' · Retiré' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="diff-stat-add">+{added} mots</span>
                  <span className="diff-stat-remove">−{removed} mots</span>
                </div>
                <div className="history-diff-tools">
                  <div
                    className="history-view-switch"
                    role="group"
                    aria-label="Affichage de la comparaison"
                  >
                    <button
                      type="button"
                      aria-pressed={view === 'source'}
                      onClick={() => setView('source')}
                    >
                      Source
                    </button>
                    <button
                      type="button"
                      aria-pressed={view === 'reading'}
                      onClick={() => setView('reading')}
                    >
                      Lecture
                    </button>
                  </div>
                  <div
                    className="history-inline-navigation"
                    role="group"
                    aria-label="Parcourir les modifications"
                  >
                    <span className="history-change-count" aria-live="polite">
                      {loading
                        ? 'Chargement…'
                        : changeIndex < 0
                          ? `${changes.length} passage${changes.length > 1 ? 's' : ''} modifié${changes.length > 1 ? 's' : ''}`
                          : `${changeIndex + 1} / ${changes.length}`}
                    </span>
                    <button
                      type="button"
                      disabled={loading || !!error || !!incompatible || !changes.length}
                      aria-label="Modification précédente"
                      onClick={() => nextChange(-1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={loading || !!error || !!incompatible || !changes.length}
                      aria-label="Modification suivante"
                      onClick={() => nextChange(1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              </div>
              {error && (
                <p className="workspace-error" role="alert">
                  {error}
                </p>
              )}
              {confirm && (
                <div className="history-confirm" role="alert">
                  <p>
                    Restaurer « {confirm.name} »{' '}
                    {confirm.scope ? 'pour sa section' : 'pour tout le projet'} ? L’état actuel sera
                    conservé avant restauration.
                  </p>
                  <button disabled={busy} onClick={() => setConfirm(null)}>
                    Annuler
                  </button>
                  <button disabled={busy} onClick={() => void restore()}>
                    Confirmer la restauration
                  </button>
                </div>
              )}
              {loading ? (
                <p className="history-empty" role="status">
                  Chargement des versions…
                </p>
              ) : incompatible ? (
                <p className="history-empty">
                  Ces versions concernent des sections différentes. Comparez chacune avec le texte
                  actuel.
                </p>
              ) : error ? null : (
                <>
                  {selected && metadata.length > 0 && (
                    <p className="history-metadata">{metadata.join(' · ')}</p>
                  )}
                  <div
                    className="history-diff-scroll"
                    ref={diffRef}
                    tabIndex={0}
                    aria-label="Passages comparés"
                  >
                    {!rows.length && (
                      <p className="history-empty">
                        {selected
                          ? metadata.length
                            ? 'Le texte est identique ; les changements de structure figurent ci-dessus.'
                            : 'Ce texte est vide dans les deux versions.'
                          : 'Aucun texte dans cette sélection.'}
                      </p>
                    )}
                    {rows.map((row, index) => (
                      <div
                        key={index}
                        data-change={index}
                        className={
                          'history-diff-row' +
                          (row.changed ? ' is-changed' : '') +
                          (changes[changeIndex] === index ? ' is-current-change' : '')
                        }
                      >
                        <div
                          className={
                            'history-diff-cell ' +
                            (row.changed && row.left.length ? 'diff-removed' : '')
                          }
                        >
                          <span
                            className="diff-gutter"
                            aria-label={row.changed ? 'Retrait' : undefined}
                          >
                            {row.changed && row.left.length ? '−' : ''}
                            <small>{row.left.length ? row.leftStart + 1 : ''}</small>
                          </span>
                          <div className={'diff-prose' + (view === 'reading' ? ' is-reading' : '')}>
                            {view === 'reading' ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={comparisonMarkdown}
                              >
                                {row.left.join('\n\n')}
                              </ReactMarkdown>
                            ) : (
                              row.words
                                .filter((w) => !w.added)
                                .map((w, i) =>
                                  w.removed ? (
                                    <del key={i}>{w.value}</del>
                                  ) : (
                                    <span key={i}>{w.value}</span>
                                  ),
                                )
                            )}
                          </div>
                        </div>
                        <div
                          className={
                            'history-diff-cell ' +
                            (row.changed && row.right.length ? 'diff-added' : '')
                          }
                        >
                          <span
                            className="diff-gutter"
                            aria-label={row.changed ? 'Ajout' : undefined}
                          >
                            {row.changed && row.right.length ? '+' : ''}
                            <small>{row.right.length ? row.rightStart + 1 : ''}</small>
                          </span>
                          <div className={'diff-prose' + (view === 'reading' ? ' is-reading' : '')}>
                            {view === 'reading' ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={comparisonMarkdown}
                              >
                                {row.right.join('\n\n')}
                              </ReactMarkdown>
                            ) : (
                              row.words
                                .filter((w) => !w.removed)
                                .map((w, i) =>
                                  w.added ? (
                                    <ins key={i}>{w.value}</ins>
                                  ) : (
                                    <span key={i}>{w.value}</span>
                                  ),
                                )
                            )}
                          </div>
                        </div>
                        {row.changed && rightId === 'current' && selected?.right && (
                          <div className="history-passage-action">
                            <button disabled={busy} onClick={() => void apply(index)}>
                              <ArrowRight size={12} />
                              Reprendre le passage de référence
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <footer className="history-legend">
                    {rightId === 'current'
                      ? 'Les reprises de passages modifient le texte actuel. Une version est conservée avant chaque reprise.'
                      : 'Comparaison de deux instantanés. Choisissez « Texte actuel » à droite pour reprendre un passage.'}
                  </footer>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
