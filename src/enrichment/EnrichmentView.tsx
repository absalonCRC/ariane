import { localizeMessage, t, useLocale } from '../i18n';
import { AnimatedDetails } from '../components/AnimatedDetails';
import { useState } from 'react';
import { request } from '../app/client';
import type { Source } from '../app/types';

export function EnrichmentView({
  source,
  projectPath,
  onChange,
  onRead,
  onLocate,
}: {
  source: Source;
  projectPath: string;
  onChange: (source: Source) => void;
  onRead: (id: string) => void;
  onLocate: (section: string, node: string | null, quote: string) => void;
}) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const data = source.enrichment;
  const fields = data?.fields.filter((f) => f.status !== 'confirmed') || [];
  if (!data) return null;
  async function ignore(evidence: string | null) {
    setBusy(true);
    setError('');
    try {
      onChange(
        await request<Source>('ignoreEnrichment', { projectPath, source: source.id, evidence }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="enrichment" aria-label={t('Enrichissements du manuscrit')}>
      <h3>{t('Références liées')}</h3>
      <p className="hint">
        {t(
          'Un même passage, affiché ici depuis le manuscrit. Modifiez l’original pour le retrouver à jour dans ses références.',
        )}
      </p>
      {fields.length > 0 && (
        <dl className="enrichment-fields">
          {fields.map((f) => (
            <div key={`${f.field}:${f.value}`}>
              <dt>
                {t(f.field)}{' '}
                <small>
                  {f.status === 'conflict'
                    ? t('À vérifier · valeurs différentes')
                    : f.status === 'confirmed'
                      ? t('Déjà dans la fiche')
                      : t('Complété depuis le manuscrit')}
                </small>
              </dt>
              <dd>
                {f.target ? (
                  <button className="source-link" onClick={() => onRead(f.target!)}>
                    {f.value}
                  </button>
                ) : (
                  f.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <AnimatedDetails
        open={data.passages.length <= 3}
        summary={
          <>
            {t(data.passages.length === 1 ? '{0} instance liée' : '{0} instances liées', {
              0: data.passages.length,
            })}
          </>
        }
      >
        {data.passages.map((p) => (
          <article key={p.id} className="enrichment-passage">
            <button className="source-link" onClick={() => onLocate(p.section, p.node, p.quote)}>
              {t('{0} · ligne {1}', { 0: p.sectionTitle, 1: p.line })}
            </button>
            <blockquote>{p.quote}</blockquote>
            {p.uncertain && (
              <p className="hint">
                {t(
                  'Les formulations incertaines, négatives ou citées restent du contexte ; elles ne remplissent pas de champ.',
                )}
              </p>
            )}
            {p.related.length > 0 && (
              <p className="hint">
                {t('Mentionnés dans le même passage :')}{' '}
                {p.related.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ', '}
                    <button className="source-link" onClick={() => onRead(r.id)}>
                      {r.title}
                    </button>
                  </span>
                ))}
              </p>
            )}
            <button disabled={busy} className="enrichment-ignore" onClick={() => void ignore(p.id)}>
              {t('Masquer cette instance')}
            </button>
          </article>
        ))}
      </AnimatedDetails>
      {data.ignored > 0 && (
        <button disabled={busy} onClick={() => void ignore(null)}>
          {t('Rétablir les instances masquées ({0})', { 0: data.ignored })}
        </button>
      )}
      {error && (
        <p role="status" className="error-text">
          {localizeMessage(error)}
        </p>
      )}
    </section>
  );
}
