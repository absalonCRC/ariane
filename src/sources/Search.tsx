import { useEffect, useState } from 'react';
import { X, Search as SearchIcon } from 'lucide-react';
import { request } from '../app/client';
import type { Source } from '../app/types';
export function SourceSearch({
  initial,
  onClose,
  onSelect,
}: {
  initial: string;
  onClose: () => void;
  onSelect: (s: Source) => void;
}) {
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setBusy(true);
      void request<Source[]>('search', { query })
        .then((v) => {
          if (alive) {
            setResults(v);
            setError('');
          }
        })
        .catch((e) => {
          if (alive) setError(String(e));
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <aside className="reader source-search">
      <div className="panel-top">
        <span>Rechercher dans les sources</span>
        <button className="icon-button" aria-label="Fermer la recherche" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="command-search">
        <SearchIcon size={16} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Une idée, une personne, un lieu…"
          aria-label="Rechercher une source"
        />
      </div>
      <p className="hint">Sources du projet · Recherche locale</p>
      {busy ? (
        <p className="empty-state">Recherche…</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : results.length ? (
        results.map((s) => (
          <button className="search-result" key={s.id} onClick={() => onSelect(s)}>
            <strong>{s.title}</strong>
            <small>
              {s.kind} · {s.path}
              {s.page && ' · p. ' + s.page}
            </small>
            <p>{s.text.slice(0, 240)}</p>
          </button>
        ))
      ) : (
        <p className="empty-state">
          {query
            ? 'Aucune source correspondante. Essayez d’autres mots ou élargissez les dossiers sélectionnés.'
            : 'Retrouvez un passage de vos notes ou PDF.'}
        </p>
      )}
    </aside>
  );
}
