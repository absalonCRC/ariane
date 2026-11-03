import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { t } from '../i18n';
import { PAGE_SIZE, plainPages, type MarkdownPages } from './markdownPages';
export function ProgressiveMarkdown({ text, excerpt }: { text: string; excerpt?: string }) {
  const [result, setResult] = useState<{ text: string; value: MarkdownPages } | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
    if (text.length <= PAGE_SIZE) return;
    const accept = (value: MarkdownPages) => {
      setResult({ text, value });
      const match = excerpt ? text.indexOf(excerpt) : -1;
      setPage(
        Math.max(
          0,
          value.pages.findIndex((p) => p.from <= match && p.to > match),
        ),
      );
    };
    if (typeof Worker === 'undefined') {
      accept(plainPages(text));
      return;
    }
    const worker = new Worker(new URL('./markdownPages.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<MarkdownPages>) => {
      accept(event.data);
      worker.terminate();
    };
    worker.onerror = () => {
      accept(plainPages(text));
      worker.terminate();
    };
    worker.postMessage(text);
    return () => worker.terminate();
  }, [text, excerpt]);
  const pages =
    text.length <= PAGE_SIZE
      ? { pages: [{ from: 0, to: text.length }], definitions: '' }
      : result?.text === text
        ? result.value
        : null;
  if (!pages) return <p className="hint">{t('Chargement du texte…')}</p>;
  const active = pages.pages[Math.min(page, pages.pages.length - 1)];
  const content = active ? text.slice(active.from, active.to) : '';
  return (
    <>
      {pages.pages.length > 1 && (
        <nav className="reader-pages" aria-label={t('Pages de la source')}>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('Précédent')}
          </button>
          <span>
            {page + 1} / {pages.pages.length}
          </span>
          <button disabled={page >= pages.pages.length - 1} onClick={() => setPage((p) => p + 1)}>
            {t('Suivant')}
          </button>
        </nav>
      )}
      {active?.plain ? (
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{content}</div>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            img: () => null,
            a: ({ children }) => <span className="source-link">{children}</span>,
          }}
        >
          {content + (pages.pages.length > 1 ? '\n\n' + pages.definitions : '')}
        </ReactMarkdown>
      )}
    </>
  );
}
