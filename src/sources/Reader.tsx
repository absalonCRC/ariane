import { t, useLocale } from '../i18n';
import { usePanelFocus } from '../components/usePanelFocus';
import { SourceOccurrences } from './SourceOccurrences';
import type { SourceOccurrence } from './occurrences';
import type { Section } from '../contracts/project';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ProgressiveMarkdown } from './ProgressiveMarkdown';
import type { Source } from '../contracts/sources';
import type { DocumentPosition } from '../contracts/writingSession';
import { DocumentViewer } from './DocumentViewer';
import type { DocumentAnchor } from '../contracts/annotations';
import { useContextMenu } from '../components/ContextMenu';
import { selectedSourceText, sourceContext } from './contextMenu';
import { SourceAliases } from './SourceAliases';
import { EnrichmentView } from '../enrichment/EnrichmentView';
import { MarginPinAction, type MarginPinProps } from './MarginPinAction';
export function Reader({
  source: s,
  reveal,
  onDocumentSelect,
  replacing,
  resume,
  onPosition,
  onRestoreFailed,
  sections = [],
  contentVersion,
  onOccurrence,
  onClose,
  projectPath,
  onChange,
  onRead,
  onLocate,
  onCite,
  marginPin,
}: {
  source: Source;
  reveal?: DocumentAnchor;
  replacing?: boolean;
  resume?: DocumentPosition;
  onRestoreFailed?: () => void;
  onPosition?: (position: DocumentPosition) => void;
  onDocumentSelect?: (value: DocumentAnchor) => Promise<void>;
  sections?: Section[];
  contentVersion?: string;
  onOccurrence?: (hit: SourceOccurrence) => void;
  onClose: () => void;
  projectPath: string;
  onChange: (source: Source) => void;
  onRead: (id: string) => void;
  onCite?: (quote: string) => unknown;
  marginPin?: MarginPinProps;
  onLocate: (section: string, node: string | null, quote: string) => void;
}) {
  useLocale();
  const openMenu = useContextMenu();
  const panel = useRef<HTMLElement>(null);
  usePanelFocus(panel, true);
  const fields = Object.entries(s.fields || {}).filter(
    ([key, value]) =>
      !['nom', 'title', 'titre', 'type', 'alias', 'aliases'].includes(key.toLocaleLowerCase()) &&
      value !== null &&
      value !== '' &&
      (!Array.isArray(value) || value.length > 0) &&
      !s.enrichment?.fields.some((f) => f.field === key && f.status === 'derived'),
  );
  const excerpt = useRef<HTMLQuoteElement>(null);
  useEffect(() => {
    excerpt.current?.scrollIntoView({ block: 'nearest' });
  }, [s.id, s.selectedExcerpt]);
  const binary = s.kind === 'PDF' || s.kind === 'Image';
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
      className={binary ? 'reader document-reader' : 'reader'}
      aria-label={t('Source complète')}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, select, iframe, img')) return;
        const quote = selectedSourceText(event.currentTarget);
        openMenu(event, sourceContext(s, { quote, onCite: quote ? onCite : undefined }));
      }}
    >
      <div className="panel-top">
        <span>{t('Source complète')}</span>
        <button className="icon-button" aria-label={t('Fermer la source')} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="state-content" key={s.id}>
        <p className="source-path">{s.path}</p>
        <h2>{s.title}</h2>
        {marginPin && <MarginPinAction {...marginPin} />}
        {s.selectedExcerpt && (
          <blockquote ref={excerpt} className="memory-source-excerpt">
            {s.selectedExcerpt}
          </blockquote>
        )}
        {binary ? (
          <DocumentViewer
            key={s.id + s.fingerprint}
            source={s}
            reveal={reveal}
            resume={resume}
            onPosition={onPosition}
            onRestoreFailed={onRestoreFailed}
            replacing={!!replacing}
            onLink={onDocumentSelect}
          />
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
        <SourceAliases source={s} projectPath={projectPath} onChange={onChange} />
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
