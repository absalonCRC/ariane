import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localizeMessage, t, useLocale } from '../i18n';
import { entityTint } from '../enrichment/entityTypes';
import { plainExcerpt } from '../enrichment/excerpts';
import type { Source } from '../contracts/sources';
import { MarginPinAction } from './MarginPinAction';
export function FloatingVaultResults({
  query,
  sources,
  busy,
  error,
  colors,
  pinned,
  pinning,
  canPin,
  onOpen,
  onPin,
}: {
  query: string;
  sources: Source[];
  busy: boolean;
  error: string;
  colors?: Record<string, string>;
  pinned: Set<string>;
  pinning: boolean;
  canPin: boolean;
  onOpen: (source: Source) => void;
  onPin: (source: Source) => void;
}) {
  useLocale();
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query]);
  const pages = Math.max(1, Math.ceil(sources.length / 2));
  const current = Math.min(page, pages - 1);
  return (
    <aside
      className="floating-vault-results"
      aria-label={t('Fiches du vault trouvées')}
      aria-busy={busy}
    >
      {busy ? (
        <p role="status" className="vault-search-status">
          {t('Recherche…')}
        </p>
      ) : error ? (
        <p role="alert" className="vault-search-status">
          {localizeMessage(error)}
        </p>
      ) : sources.length ? (
        <>
          <div className="floating-vault-cards">
            {sources.slice(current * 2, current * 2 + 2).map((source) => (
              <article
                key={source.id}
                className="floating-vault-card entity-tinted"
                style={entityTint(source.kind, colors)}
              >
                <button
                  className="vault-result-open"
                  onClick={() => onOpen(source)}
                  aria-label={t('Ouvrir {0}', { 0: source.title })}
                >
                  <strong>{source.title}</strong>
                  <small>{t(source.kind)}</small>
                  <span>{plainExcerpt(source.text).slice(0, 140)}</span>
                </button>
                <MarginPinAction
                  canPin={canPin}
                  busy={pinning}
                  pinned={pinned.has(source.id)}
                  onPin={() => onPin(source)}
                />
              </article>
            ))}
          </div>
          <div className="vault-result-pages">
            {pages > 1 && (
              <button
                aria-label={t('Fiches précédentes')}
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft size={14} />
              </button>
            )}
            <small>
              {sources.length === 1
                ? t('1 fiche dans les vaults')
                : t('{0} fiches dans les vaults', { 0: sources.length })}
              {pages > 1 ? ` · ${current + 1}/${pages}` : ''}
            </small>
            {pages > 1 && (
              <button
                aria-label={t('Fiches suivantes')}
                disabled={current === pages - 1}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </>
      ) : (
        <p role="status" className="vault-search-status">
          {t('Aucune source correspondante.')}
        </p>
      )}
    </aside>
  );
}
