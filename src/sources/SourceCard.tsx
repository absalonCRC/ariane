import { SourceOccurrences } from './SourceOccurrences';
import type { SourceOccurrence } from './occurrences';
import type { Section } from '../app/types';
import { useSharedPanel, type PanelOrigin } from '../components/useSharedPanel';
import { X, Quote, ArrowUpRight, Link2 } from 'lucide-react';
import { useContextMenu } from '../components/ContextMenu';
import { sourceContext, sourceExcerpt } from './contextMenu';
import type { Source } from '../app/types';
import { composeCitation } from './citations';
import type { Settings } from '../app/types';
export function SourceCard({
  source: s,
  sections = [],
  contentVersion,
  onOccurrence,
  origin,
  onClose,
  onRead,
  onCite,
  onAssociate,
  onRegister,
  citationStyle,
}: {
  source: Source;
  sections?: Section[];
  contentVersion?: string;
  onOccurrence?: (hit: SourceOccurrence) => void;
  top?: number;
  origin?: PanelOrigin;
  onClose: () => void;
  onRead: () => void;
  onCite: (s: Source, text: string) => void;
  onAssociate: () => void;
  onRegister: (s: Source, text: string) => Promise<void>;
  citationStyle: Settings['citationStyle'];
}) {
  const panel = useSharedPanel(origin, s.id, onClose);
  const openMenu = useContextMenu();
  const fields = Object.entries(s.fields || {})
    .filter(
      ([k, v]) =>
        !['tags', 'aliases', 'alias', 'title', 'nom', 'type'].includes(k.toLocaleLowerCase()) &&
        v !== null &&
        v !== '' &&
        (!Array.isArray(v) || v.length > 0),
    )
    .slice(0, 5);
  const excerpt = sourceExcerpt(s);
  const selected = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    return text && sel?.anchorNode?.parentElement?.closest('.source-card') ? text : excerpt;
  };
  return (
    <section
      ref={panel}
      className="source-card shared-panel floating"
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, select')) return;
        openMenu(
          event,
          sourceContext(s, {
            quote: selected(),
            onRead,
            onCite: (quote) => onCite(s, quote),
            onAssociate,
          }),
        );
      }}
      aria-label={'Fiche ' + s.title}
    >
      <div className="shared-panel-label" aria-hidden="true">
        {origin?.label ?? s.title}
      </div>
      <button className="card-close icon-button" aria-label="Fermer la fiche" onClick={onClose}>
        <X size={14} />
      </button>
      <span className="source-kind">{s.kind}</span>
      <h2>{s.title}</h2>
      <dl>
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt>
              {k}
              {s.enrichment?.fields.some((f) => f.field === k && f.status === 'derived') && (
                <small className="derived-label"> · manuscrit</small>
              )}
            </dt>
            <dd>
              {Array.isArray(v)
                ? v.join(', ')
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v)}
            </dd>
          </div>
        ))}
        {s.tags.length > 0 && (
          <div>
            <dt>Tags</dt>
            <dd>{s.tags.map((t) => '#' + t).join(' ')}</dd>
          </div>
        )}
      </dl>
      <div
        className="source-excerpt"
        onDragStart={(e) => {
          const quote = selected();
          const value = composeCitation(s, quote, citationStyle);
          void onRegister(s, quote);
          e.dataTransfer.setData('application/x-ariane-citation', value);
          e.dataTransfer.setData('text/plain', value);
        }}
      >
        {excerpt || 'Cette source est une pièce jointe.'}
      </div>
      {s.enrichment && (
        <button className="enrichment-summary" onClick={onRead}>
          Références liées · {s.enrichment.passages.length} instance(s)
          {s.enrichment.fields.some((f) => f.status === 'conflict') && ' · valeurs à vérifier'}
        </button>
      )}
      {onOccurrence && (
        <SourceOccurrences
          key={s.id}
          source={s}
          sections={sections}
          contentVersion={contentVersion}
          onLocate={onOccurrence}
        />
      )}
      <p className="source-path">
        {s.path}
        {s.page && ` · p. ${s.page}`}
      </p>
      <button className="associate-source" onClick={onAssociate}>
        Associer à la préparation
      </button>
      <div className="source-actions">
        <button onClick={onRead}>
          <ArrowUpRight size={12} />
          Ouvrir la note
        </button>
        <button onClick={() => onCite(s, selected())}>
          <Quote size={12} />
          Citer
        </button>
        <button
          aria-label="Insérer une référence"
          onClick={() => onCite(s, '')}
        >
          <Link2 size={12} />
        </button>
      </div>
    </section>
  );
}
