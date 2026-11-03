import { localizeMessage, t, useLocale } from '../i18n';
import { usePanelFocus } from '../components/usePanelFocus';
import { SourceOccurrences } from './SourceOccurrences';
import type { SourceOccurrence } from './occurrences';
import type { Section } from '../app/types';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ProgressiveMarkdown } from './ProgressiveMarkdown';
import type { Source } from '../app/types';
import { request } from '../app/client';
import { useContextMenu } from '../components/ContextMenu';
import { selectedSourceText, sourceContext } from './contextMenu';
import { EnrichmentView } from '../enrichment/EnrichmentView';
export function Reader({
  source: s,
  sections = [],
  contentVersion,
  onOccurrence,
  onClose,
  projectPath,
  onChange,
  onRead,
  onLocate,
  onCite,
}: {
  source: Source;
  sections?: Section[];
  contentVersion?: string;
  onOccurrence?: (hit: SourceOccurrence) => void;
  onClose: () => void;
  projectPath: string;
  onChange: (source: Source) => void;
  onRead: (id: string) => void;
  onCite?: (quote: string) => unknown;
  onLocate: (section: string, node: string | null, quote: string) => void;
}) {
  useLocale();
  const openMenu = useContextMenu();
  const panel = useRef<HTMLElement>(null);
  usePanelFocus(panel, true);
  const fields = Object.entries(s.fields || {}).filter(
    ([key, value]) =>
      !['nom', 'title', 'titre', 'type'].includes(key.toLocaleLowerCase()) &&
      value !== null &&
      value !== '' &&
      (!Array.isArray(value) || value.length > 0) &&
      !s.enrichment?.fields.some((f) => f.field === key && f.status === 'derived'),
  );
  const excerpt = useRef<HTMLQuoteElement>(null);
  useEffect(() => {
    excerpt.current?.scrollIntoView({ block: 'nearest' });
  }, [s.id, s.selectedExcerpt]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl('');
    setError('');
    if (['PDF', 'Image'].includes(s.kind))
      void request<{ url: string; mime: string }>('sourceFile', { id: s.id })
        .then((f) => {
          if (!alive) return;
          setUrl(f.url);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [s.id, projectPath]);
  return (
    <aside
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="reader"
      aria-label={t('Source complète')}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, select, iframe, img')) return;
        const quote = selectedSourceText(event.currentTarget);
        openMenu(event, sourceContext(s, { quote, onCite: quote ? onCite : undefined }));
      }}
    >
      <div className="panel-top">
        <span>{t('SOURCE · LECTURE SEULE')}</span>
        <button className="icon-button" aria-label={t('Fermer la source')} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="state-content" key={s.id}>
        <p className="source-path">{s.path}</p>
        <h2>{s.title}</h2>
        {s.selectedExcerpt && (
          <blockquote ref={excerpt} className="memory-source-excerpt">
            {s.selectedExcerpt}
          </blockquote>
        )}
        {error && <p className="error-text">{localizeMessage(error)}</p>}
        {s.kind === 'PDF' ? (
          url ? (
            <iframe title={s.title} src={url + '#page=' + (s.page || 1)} />
          ) : (
            <p className="hint">{t('Ouverture du PDF…')}</p>
          )
        ) : s.kind === 'Image' ? (
          url && <img className="attachment" alt={s.title} src={url} />
        ) : (
          <div className="read-prose">
            <ProgressiveMarkdown text={s.text} excerpt={s.selectedExcerpt} />
          </div>
        )}
        {fields.length > 0 && (
          <dl className="enrichment-fields reader-fields">
            {fields.map(([key, value]) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>
                  {Array.isArray(value)
                    ? value.join(', ')
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {onOccurrence && (
          <SourceOccurrences
            source={s}
            sections={sections}
            contentVersion={contentVersion}
            onLocate={onOccurrence}
          />
        )}
        <EnrichmentView
          source={s}
          projectPath={projectPath}
          onChange={onChange}
          onRead={onRead}
          onLocate={onLocate}
        />
      </div>
    </aside>
  );
}
