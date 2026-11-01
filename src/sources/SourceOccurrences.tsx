import { useMemo, useState } from 'react';
import type { Section, Source } from '../app/types';
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
  const matches = useMemo(
    () => sourceOccurrences(sections, source),
    [sections, source, contentVersion],
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
          Afficher les suivantes
        </button>
      )}
    </>
  );
  return (
    <details className="source-occurrences">
      <summary>
        Références explicites <span>{references.length}</span> · Mentions du nom{' '}
        <span>{mentions.length}</span>
      </summary>
      <p className="hint">
        Les références sont des citations insérées dans le texte. Les mentions sont des noms ou
        alias repérés littéralement : elles ne confirment ni l’identité ni une association au
        projet.
      </p>
      {!matches.length && <p className="hint">Aucune occurrence dans les textes actuels.</p>}
      {references.length > 0 && <p className="hint">Références explicites · {references.length}</p>}
      {show(references, referenceLimit, () => setReferenceLimit((n) => n + 12))}
      {mentions.length > 0 && <p className="hint">Mentions du nom · {mentions.length}</p>}
      {show(mentions, mentionLimit, () => setMentionLimit((n) => n + 12))}
    </details>
  );
}
