import { entityTint } from '../enrichment/entityTypes';
import { localizeMessage, t, useLocale } from '../i18n';
import type { Source } from '../app/types';
export function SearchMargin({
  sources,
  colors,
  expandedId,
  expandedHeight,
  busy,
  error,
  onOpen,
}: {
  sources: Source[];
  colors?: Record<string, string>;
  expandedId?: string;
  expandedHeight?: number;
  busy: boolean;
  error: string;
  onOpen: (source: Source, element: HTMLButtonElement) => void;
}) {
  useLocale();
  return (
    <aside
      className="vault-search-margin"
      aria-label={t('Résultats des vaults dans la marge')}
      aria-busy={busy}
    >
      <p className="hint">{t('Dans les vaults')}</p>
      {busy ? (
        <p role="status" className="hint">
          {t('Recherche…')}
        </p>
      ) : error ? (
        <p role="alert" className="hint">
          {t('Recherche des vaults indisponible. {0}', { 0: localizeMessage(error) })}
        </p>
      ) : sources.length ? (
        sources.map((source) => (
          <button
            key={source.id}
            className="source-label entity-tinted"
            data-expanded={source.id === expandedId}
            style={{
              ...entityTint(source.kind, colors),
              ...(source.id === expandedId
                ? { height: expandedHeight, minHeight: expandedHeight, flexShrink: 0 }
                : {}),
            }}
            onClick={(event) => onOpen(source, event.currentTarget)}
          >
            <span>{source.title}</span>
            <small>{t(source.kind)}</small>
            <small className="search-source-excerpt">{source.text.slice(0, 180)}</small>
          </button>
        ))
      ) : (
        <p role="status" className="hint">
          {t('Aucune source correspondante.')}
        </p>
      )}
    </aside>
  );
}
