import { t, useLocale } from '../i18n';
import { useMemo, useState } from 'react';
import type { Section } from '../contracts/project';
import type { Source } from '../contracts/sources';
import { sourceOccurrences, type SourceOccurrence } from './occurrences';
export function SourceOccurrences({
  source,
  sections,
  contentVersion,
  onLocate,
}: {
  source: Source;
  sections: Section[];
  contentVersion?: string;
  onLocate: (hit: SourceOccurrence) => void;
}) {
  const locale = useLocale();
  const matches = useMemo(
    () => sourceOccurrences(sections, source),
    [sections, source, contentVersion, locale],
  );
  const references = matches.filter((hit) => hit.kind === 'reference');
  const mentions = matches.filter((hit) => hit.kind === 'mention');
  const [referenceLimit, setReferenceLimit] = useState(12);
  const [mentionLimit, setMentionLimit] = useState(12);
  const show = (hits: SourceOccurrence[], limit: number, more: () => void) => (
    <>
      {hits.slice(0, limit).map((hit) => (
        <button key={hit.key} onClick={() => onLocate(hit)}>
          <strong>{hit.title}</strong>
          <span>{hit.excerpt}</span>
        </button>
      ))}
      {hits.length > limit && (
        <button className="occurrences-more" onClick={more}>
          {t('Afficher les suivantes')}
        </button>
      )}
    </>
  );
  return (
    <details className="source-occurrences">
      <summary
        aria-label={t('Dans le manuscrit : {0} et {1}', {
          0: t(references.length === 1 ? '{0} référence explicite' : '{0} références explicites', {
            0: references.length,
          }),
          1: t(mentions.length === 1 ? '{0} mention du nom' : '{0} mentions du nom', {
            0: mentions.length,
          }),
        })}
      >
        {t('Dans le manuscrit ·')}{' '}
        <span>
          {t('{0} référence{1}', { 0: references.length, 1: references.length > 1 ? 's' : '' })}
        </span>{' '}
        ·{' '}
        <span>
          {t(mentions.length === 1 ? '{0} mention' : '{0} mentions', { 0: mentions.length })}
        </span>
      </summary>
      <p className="hint">
        {t(
          'Les références sont des citations insérées dans le texte. Les mentions sont des noms ou alias repérés littéralement : elles ne confirment ni l’identité ni une association au projet.',
        )}
      </p>
      {!matches.length && <p className="hint">{t('Aucune occurrence dans les textes actuels.')}</p>}
      {references.length > 0 && <p className="hint">{t('Références explicites')}</p>}
      {show(references, referenceLimit, () => setReferenceLimit((n) => n + 12))}
      {mentions.length > 0 && <p className="hint">{t('Mentions du nom')}</p>}
      {show(mentions, mentionLimit, () => setMentionLimit((n) => n + 12))}
    </details>
  );
}
