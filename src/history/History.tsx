import { Presence } from '../components/Presence';
import { useEffect, useState } from 'react';
import { diffArrays, diffWordsWithSpace } from 'diff';
import { request } from '../app/client';
import type { Project, Version } from '../app/types';
import { Dialog, Empty } from '../components/Dialog';
import { Plus, ArrowLeft } from 'lucide-react';
interface Props {
  project: Project;
  active: string | null;
  onClose: () => void;
  flush: () => Promise<void>;
  onRestore: (p: Project) => void;
  onApply: (id: string, text: string, revision: number) => Promise<void>;
  onError: (e: unknown) => void;
}
export function History(p: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('project');
  const [compare, setCompare] = useState<Version | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [scene, setScene] = useState(
    p.active || p.project.sections.find((s) => s.kind === 'scene')?.id || '',
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Version | null>(null);
  useEffect(() => {
    void request<Version[]>('versions').then(setVersions).catch(p.onError);
  }, [p.onError]);
  async function capture() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await p.flush();
      await request('capture', { name, scope: scope === 'project' ? null : p.active });
      setVersions(await request('versions'));
      setName('');
    } catch (e) {
      p.onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function restore(v: Version) {
    setBusy(true);
    try {
      await p.flush();
      p.onRestore(await request('restore', { id: v.id }));
      p.onClose();
    } catch (e) {
      p.onError(e);
    } finally {
      setBusy(false);
    }
  }
  const live = p.project.sections.find((s) => s.id === scene);
  const other = compare?.sections.find((s) => s.id === scene);
  const parts = diffArrays((live?.text || '').split('\n\n'), (other?.text || '').split('\n\n'));
  let oldIndex = 0;
  const hunks = parts.map((part, i) => {
    const start = oldIndex;
    if (!part.added) oldIndex += part.count || 0;
    return { ...part, index: i, start };
  });
  async function apply(i: number) {
    if (!live) return;
    const part = hunks[i];
    let paragraphs = live.text.split('\n\n');
    if (part.added) paragraphs.splice(part.start, 0, ...part.value);
    else if (part.removed) {
      const replacement = hunks[i + 1]?.added ? hunks[i + 1].value : [];
      paragraphs.splice(part.start, part.count || 0, ...replacement);
    }
    try {
      await p.onApply(live.id, paragraphs.join('\n\n'), live.revision);
      setSelected(null);
      setCompare(null);
      p.onClose();
    } catch (e) {
      p.onError(e);
    }
  }
  if (compare)
    return (
      <Dialog title="Comparer les versions" onClose={p.onClose} wide>
        <div className="compare-toolbar">
          <button onClick={() => setCompare(null)}>Retour aux versions</button>
          <select
            aria-label="Scène à comparer"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
          >
            {p.project.sections
              .filter((s) => s.kind === 'scene' && compare.sections.some((v) => v.id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
          <button disabled={busy} onClick={() => setConfirm(compare)}>
            Adopter la variante
          </button>
        </div>
        <div className="compare-labels">
          <span>Version actuelle</span>
          <span>{compare.name}</span>
        </div>
        <div className="comparison">
          {hunks.map((h, i) => {
            if (h.added && hunks[i - 1]?.removed) return null;
            const right =
              h.removed && hunks[i + 1]?.added
                ? hunks[i + 1].value
                : h.added
                  ? h.value
                  : h.removed
                    ? []
                    : h.value;
            const changed = !!(h.added || h.removed);
            const old = h.added ? [] : h.value;
            const focused = selected === i;
            const wordDiff = diffWordsWithSpace(old.join('\n\n'), right.join('\n\n'));
            return (
              <div
                key={i}
                className={
                  'compare-row ' + (changed ? 'changed ' : '') + (focused ? 'detailed' : '')
                }
                onClick={() => changed && setSelected(i)}
              >
                <div>
                  {focused
                    ? wordDiff
                        .filter((d) => !d.added)
                        .map((d, j) => (
                          <span key={j} className={d.removed ? 'removed' : ''}>
                            {d.value}
                          </span>
                        ))
                    : old.join('\n\n')}
                </div>
                <div>
                  {focused
                    ? wordDiff
                        .filter((d) => !d.removed)
                        .map((d, j) => (
                          <span key={j} className={d.added ? 'added' : ''}>
                            {d.value}
                          </span>
                        ))
                    : right.join('\n\n')}
                </div>
                {changed && focused && (
                  <button className="take-passage" onClick={() => void apply(i)}>
                    <ArrowLeft size={12} />
                    Reprendre ce passage
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Presence kind="content">
          {confirm && (
            <div className="inline-confirm">
              <p>Revenir à « {confirm.name} » ? L’état actuel sera conservé dans l’historique.</p>
              <button onClick={() => setConfirm(null)}>Annuler</button>
              <button className="primary" disabled={busy} onClick={() => void restore(confirm)}>
                Restaurer
              </button>
            </div>
          )}
        </Presence>
      </Dialog>
    );
  return (
    <Dialog title="Versions du texte" onClose={p.onClose}>
      <p className="hint">
        Conservez un instantané ou explorez une variante. Chaque restauration préserve l’état
        actuel.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void capture();
        }}
      >
        <label>
          Nom de la version
          <input
            required
            placeholder="Avant révision, autre début…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Portée
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="project">Tout le projet</option>
            {p.active && <option value="section">Cette section et ses scènes</option>}
          </select>
        </label>
        <button className="primary" disabled={busy || !name.trim()}>
          <Plus size={13} />
          Conserver cette version
        </button>
      </form>
      <div className="versions-list">
        {versions.length ? (
          versions.map((v) => (
            <div key={v.id}>
              <div>
                <strong>{v.name}</strong>
                <small>
                  {new Date(v.created).toLocaleString('fr-FR')} ·{' '}
                  {v.scope ? 'Section' : 'Projet entier'}
                </small>
              </div>
              <button
                onClick={() => {
                  void request<Version>('version', { id: v.id })
                    .then((full) => {
                      setCompare(full);
                      const first = full.sections.find((s) => s.kind === 'scene');
                      if (!full.sections.some((s) => s.id === scene) && first) setScene(first.id);
                    })
                    .catch(p.onError);
                }}
              >
                Comparer
              </button>
              <button onClick={() => setConfirm(v)}>Travailler ici</button>
            </div>
          ))
        ) : (
          <Empty>Aucune version nommée pour le moment.</Empty>
        )}
      </div>
      {confirm && (
        <div className="inline-confirm">
          <p>Revenir à « {confirm.name} » ? Une copie de l’état actuel sera conservée.</p>
          <button onClick={() => setConfirm(null)}>Annuler</button>
          <button className="primary" disabled={busy} onClick={() => void restore(confirm)}>
            Restaurer
          </button>
        </div>
      )}
    </Dialog>
  );
}
