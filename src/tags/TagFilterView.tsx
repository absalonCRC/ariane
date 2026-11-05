import { useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft } from 'lucide-react';
import type { Project } from '../contracts/project';
import type { SmartTag } from '../contracts/smartTags';
import { t, useLocale } from '../i18n';
import { taggedPassages, type TagPassage } from './passages';
import type { EntityBatch } from '../contracts/entities';
import type { PropertyRelation } from '../contracts/lineProperties';
import { TagPassageTable } from './TagPassageTable';
import { tagTableProjection } from './table';
export function TagFilterView({
  project,
  tag,
  onClose,
  onOpen,
  passages: projected,
  mode = 'text',
  batches = [],
  onRelation,
  onTag,
  onRemove,
  removalLabel,
  onError,
}: {
  project: Project;
  tag: SmartTag;
  onClose: () => void;
  onOpen: (passage: TagPassage) => void;
  passages?: TagPassage[];
  mode?: 'text' | 'table';
  batches?: EntityBatch[];
  onRelation: (relation: PropertyRelation) => void;
  onTag: (id: string) => void;
  onRemove?: (assignment: import('./model').EffectiveTag) => void | Promise<void>;
  removalLabel?: (assignment: import('./model').EffectiveTag) => string;
  onError?: (error: unknown) => void;
}) {
  useLocale();
  const passages = useMemo(
    () => projected ?? taggedPassages(project, tag.id),
    [project, tag.id, projected],
  );
  const close = useRef<HTMLButtonElement>(null);
  const table = useMemo(
    () => (mode === 'table' ? tagTableProjection(project, passages, batches) : null),
    [mode, project, passages, batches],
  );
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className="manuscript-column tag-filter-view"
      data-mode={mode}
      style={
        table
          ? ({ '--tag-table-width': table.preferredWidth + 'px' } as React.CSSProperties)
          : undefined
      }
      aria-label={t('Vue filtrée par smart-tag')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="tag-filter-header">
        <button ref={close} onClick={onClose}>
          <ArrowLeft size={15} />
          {t('Revenir au texte')}
        </button>
        <h1>
          <span className="smart-tag" style={{ '--tag-color': tag.color } as React.CSSProperties}>
            #{tag.name}
          </span>
        </h1>
        <p>
          {t('{0} passage{1} dans {2} texte{3}', {
            0: passages.length,
            1: passages.length === 1 ? '' : 's',
            2: new Set(passages.map((p) => p.section)).size,
            3: new Set(passages.map((p) => p.section)).size === 1 ? '' : 's',
          })}
        </p>
        <p className="hint">
          {t(
            'Vue temporaire en lecture seule · Cliquez sur un passage pour modifier son original.',
          )}
        </p>
      </header>
      {!passages.length && <p className="hint">{t('Aucun passage ne porte ce smart-tag.')}</p>}
      {table ? (
        <TagPassageTable
          project={project}
          table={table}
          onPassage={onOpen}
          onRelation={onRelation}
          onTag={onTag}
          onRemove={onRemove}
          removalLabel={removalLabel}
          onError={onError}
        />
      ) : (
        passages.map((passage, index) => (
          <article
            className="tag-filter-passage"
            key={passage.section + ':' + (passage.node ?? passage.from)}
          >
            {(index === 0 || passages[index - 1].section !== passage.section) && (
              <h2>{passage.title}</h2>
            )}
            <div
              className="tag-filter-original"
              role="button"
              tabIndex={0}
              aria-label={t('Ouvrir le passage original dans {0}', { 0: passage.title })}
              onClick={() => onOpen(passage)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(passage);
                }
              }}
            >
              {passage.text ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ children }) => <span>{children}</span>,
                    img: ({ alt }) => <span>{alt || t('Image')}</span>,
                  }}
                >
                  {passage.text}
                </ReactMarkdown>
              ) : (
                <p className="hint">{t('Passage vide')}</p>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
