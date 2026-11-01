import type { Source } from '../app/types';
export function SearchMargin({
  sources,
  busy,
  error,
  onOpen,
}: {
  sources: Source[];
  busy: boolean;
  error: string;
  onOpen: (source: Source, element: HTMLButtonElement) => void;
}) {
  return (
    <aside
      className="vault-search-margin"
      aria-label="Résultats des vaults dans la marge"
      aria-busy={busy}
    >
      <p className="hint">Dans les vaults</p>
      {busy ? (
        <p role="status" className="hint">
          Recherche…
        </p>
      ) : error ? (
        <p role="alert" className="hint">
          Recherche des vaults indisponible. {error}
        </p>
      ) : sources.length ? (
        sources.map((source) => (
          <button
            key={source.id}
            className="source-label"
            onClick={(event) => onOpen(source, event.currentTarget)}
          >
            <span>{source.title}</span>
            <small>{source.kind}</small>
            <small className="search-source-excerpt">{source.text.slice(0, 180)}</small>
          </button>
        ))
      ) : (
        <p role="status" className="hint">
          Aucune source correspondante.
        </p>
      )}
    </aside>
  );
}
