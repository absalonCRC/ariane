import { Fragment, useEffect, useState } from 'react';
import { Archive, Pin } from 'lucide-react';
import { request } from '../app/client';
import type { ProjectEntry } from '../app/types';
export function ProjectCatalog({
  onOpen,
  onError,
  searchable = true,
  currentPath,
}: {
  onOpen: (path: string) => unknown;
  onError?: (e: unknown) => void;
  currentPath?: string;
  searchable?: boolean;
}) {
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void request<ProjectEntry[]>('projects')
      .then((v) => {
        if (alive) setEntries(v);
      })
      .catch((e) => onError?.(e))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [onError]);
  async function change(entry: ProjectEntry, patch: Partial<ProjectEntry>) {
    setBusy(true);
    try {
      setEntries(
        await request('projectCatalog', {
          path: entry.path,
          pinned: entry.pinned,
          archived: entry.archived,
          ...patch,
        }),
      );
    } catch (e) {
      onError?.(e);
    } finally {
      setBusy(false);
    }
  }
  const values = entries
    .filter(
      (e) =>
        e.archived === archived && e.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastOpened.localeCompare(a.lastOpened),
    );
  return (
    <div
      className="project-catalog"
      aria-label="Bibliothèque de projets"
      aria-busy={loading || busy}
    >
      {searchable && (
        <input
          aria-label="Filtrer les projets"
          placeholder="Retrouver un projet…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="library-tabs">
        <button aria-pressed={!archived} onClick={() => setArchived(false)}>
          {searchable ? 'Récents' : 'Projets'}
        </button>
        <button aria-pressed={archived} onClick={() => setArchived(true)}>
          Archives
        </button>
      </div>
      {loading ? (
        <p className="hint">Ouverture…</p>
      ) : !values.length ? (
        <p className="hint">
          {query
            ? 'Aucun projet correspondant.'
            : archived
              ? 'Aucun projet archivé.'
              : 'Les projets créés ou ouverts apparaîtront ici.'}
        </p>
      ) : (
        values.map((entry, index) => (
          <Fragment key={entry.path}>
            {!searchable &&
              !archived &&
              (index === 0 || values[index - 1].pinned !== entry.pinned) && (
                <p className="catalog-group-label">{entry.pinned ? 'Épinglés' : 'Récents'}</p>
              )}
            <div className="catalog-entry" key={entry.path}>
              <button
                className="catalog-open"
                aria-current={entry.path === currentPath ? 'page' : undefined}
                disabled={!entry.available || busy}
                onClick={() => onOpen(entry.path)}
                title={entry.name + '\n' + entry.path}
              >
                <strong>{entry.name}</strong>
                {(searchable || !entry.available) && (
                  <small>
                    {!entry.available
                      ? 'Dossier introuvable · Ouvrez son nouvel emplacement'
                      : entry.pinned
                        ? 'Épinglé'
                        : new Date(entry.lastOpened).toLocaleDateString('fr-FR')}
                  </small>
                )}
              </button>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={(entry.pinned ? 'Désépingler ' : 'Épingler ') + entry.name}
                aria-pressed={entry.pinned}
                onClick={() => void change(entry, { pinned: !entry.pinned })}
              >
                <Pin size={13} />
              </button>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={(entry.archived ? 'Désarchiver ' : 'Archiver ') + entry.name}
                onClick={() => void change(entry, { archived: !entry.archived })}
              >
                <Archive size={13} />
              </button>
            </div>
          </Fragment>
        ))
      )}
      {archived && <p className="hint">Les projets archivés restent sur ce Mac.</p>}
    </div>
  );
}
