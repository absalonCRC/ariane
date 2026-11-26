import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DocumentAnchor, Region } from '../contracts/annotations';
import type { DocumentPosition } from '../contracts/writingSession';
import type { Source } from '../contracts/sources';
import { localizeMessage, t } from '../i18n';
import { request } from '../platform/client';
import { DocumentPage, loadPdf } from './DocumentPage';
import './document-reader.css';

function selectedText(range: Range) {
  const fragment = range.cloneContents();
  for (const br of fragment.querySelectorAll('br')) br.replaceWith('\n');
  return fragment.textContent ?? '';
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function region(x1: number, y1: number, x2: number, y2: number, box: DOMRect): Region {
  return [
    clamp((Math.min(x1, x2) - box.left) / box.width),
    clamp((Math.min(y1, y2) - box.top) / box.height),
    clamp((Math.max(x1, x2) - box.left) / box.width),
    clamp((Math.max(y1, y2) - box.top) / box.height),
  ];
}
export function DocumentViewer({
  source,
  reveal,
  onLink,
  replacing,
  resume,
  onPosition,
  onRestoreFailed,
}: {
  source: Source;
  reveal?: DocumentAnchor;
  onLink?: (value: DocumentAnchor) => Promise<void>;
  replacing: boolean;
  resume?: DocumentPosition;
  onPosition?: (position: DocumentPosition) => void;
  onRestoreFailed?: () => void;
}) {
  const [page, setPage] = useState(
    Math.max(1, Math.floor(reveal?.page ?? resume?.page ?? source.page ?? 1)),
  );
  const [zoom, setZoom] = useState(Math.max(0.5, Math.min(3, resume?.zoom ?? 1)));
  const [url, setUrl] = useState('');
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [linkError, setLinkError] = useState(''),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false),
    [area, setArea] = useState(source.kind === 'Image');
  const [selection, setSelection] = useState<DocumentAnchor | undefined>(reveal);
  const [drag, setDrag] = useState<Region | null>(null);
  const start = useRef<[number, number] | null>(null);
  const frame = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const pendingRestore = useRef(resume);
  const callbacks = useRef({ onPosition, onRestoreFailed });
  callbacks.current = { onPosition, onRestoreFailed };
  const publish = () => {
    const el = frame.current;
    if (!el || !ready || pendingRestore.current) return;
    callbacks.current.onPosition?.({
      id: source.id,
      fingerprint: source.fingerprint,
      page,
      zoom,
      top: el.scrollTop,
      left: el.scrollLeft,
    });
  };
  useEffect(() => {
    if (!ready || !frame.current) return;
    const saved = pendingRestore.current;
    if (saved) {
      frame.current.scrollTop = Math.max(0, saved.top);
      frame.current.scrollLeft = Math.max(0, saved.left);
      pendingRestore.current = undefined;
    }
    publish();
  }, [ready, page, zoom]);
  const fail = useCallback((e: unknown) => {
    if (pendingRestore.current) {
      pendingRestore.current = undefined;
      callbacks.current.onRestoreFailed?.();
    }
    setError(String(e));
    setReady(false);
  }, []);
  const painted = useCallback((text: boolean) => {
    setArea(!text);
    setReady(true);
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, Math.floor(entry.contentRect.width))),
    );
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    async function open() {
      if (reveal && reveal.fingerprint !== source.fingerprint)
        throw new Error(t('Source modifiée. Vérifiez le lien documentaire.'));
      const f = await request('sourceFile', { id: source.id, fingerprint: source.fingerprint });
      ctrl.signal.throwIfAborted();
      if (source.kind === 'Image') {
        setUrl(f.url);
        return;
      }
      const doc = await loadPdf(f.url, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setPdf(doc);
        setPage((p) => Math.min(p, doc.numPages));
      }
    }
    void open().catch((e) => {
      if (!ctrl.signal.aborted) fail(e);
    });
    return () => ctrl.abort();
  }, [source.id, source.kind, source.fingerprint, reveal, fail]);
  useEffect(() => {
    if (ready && selection === reveal && reveal)
      sheet.current?.querySelector('mark')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [ready, reveal, selection, zoom, width]);
  function select(rectangles: Region[], quote = '', before = '', after = '') {
    if (!rectangles.length) return;
    setSelection({
      version: 1,
      sourceId: source.id,
      vaultId: source.vaultId,
      path: source.path,
      fingerprint: source.fingerprint,
      page,
      rectangles,
      quote,
      before,
      after,
    });
  }
  function selectText() {
    const s = window.getSelection(),
      layer = sheet.current?.querySelector('.document-text');
    if (area || !ready || !layer || !s?.rangeCount || s.isCollapsed) return;
    const range = s.getRangeAt(0);
    if (!layer.contains(range.commonAncestorContainer)) return;
    const box = sheet.current!.getBoundingClientRect();
    // WebKit includes both a selected span's box and the glyphs inside it.
    // Measure the selected characters once, including partially selected lines.
    const rects: Region[] = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue;
      const segment = document.createRange();
      segment.selectNodeContents(node);
      if (node === range.startContainer) segment.setStart(node, range.startOffset);
      if (node === range.endContainer) segment.setEnd(node, range.endOffset);
      if (segment.collapsed) continue;
      for (const r of segment.getClientRects()) {
        const bounds = region(r.left, r.top, r.right, r.bottom, box);
        if (bounds[2] > bounds[0] && bounds[3] > bounds[1]) rects.push(bounds);
      }
    }
    const prefix = document.createRange(),
      suffix = document.createRange();
    prefix.selectNodeContents(layer);
    prefix.setEnd(range.startContainer, range.startOffset);
    suffix.selectNodeContents(layer);
    suffix.setStart(range.endContainer, range.endOffset);
    select(
      rects,
      selectedText(range),
      selectedText(prefix).slice(-96),
      selectedText(suffix).slice(0, 96),
    );
  }
  function navigate(p: number) {
    setReady(false);
    setSelection(undefined);
    setPage(p);
  }
  const shown = drag ? [drag] : selection?.page === page ? selection.rectangles : [];
  return (
    <section className="document-viewer">
      <div className="document-controls">
        {pdf && (
          <>
            <button
              disabled={page <= 1}
              aria-label={t('Page précédente')}
              onClick={() => navigate(page - 1)}
            >
              ‹
            </button>
            <span>
              {page} / {pdf.numPages}
            </span>
            <button
              disabled={page >= pdf.numPages}
              aria-label={t('Page suivante')}
              onClick={() => navigate(page + 1)}
            >
              ›
            </button>
          </>
        )}
        <button
          disabled={zoom <= 0.5}
          aria-label={t('Réduire le zoom')}
          onClick={() => setZoom((z) => z - 0.25)}
        >
          −
        </button>
        <span>{Math.round(zoom * 100)} %</span>
        <button
          disabled={zoom >= 3}
          aria-label={t('Augmenter le zoom')}
          onClick={() => setZoom((z) => z + 0.25)}
        >
          +
        </button>
        {pdf && (
          <button aria-pressed={area} onClick={() => setArea((v) => !v)}>
            {t('Zone')}
          </button>
        )}
      </div>
      {error && <p role="alert">{localizeMessage(error)}</p>}
      {!ready && !error && <p role="status">{t('Chargement…')}</p>}
      <div ref={frame} className="document-scroll" onScroll={publish}>
        <div
          ref={sheet}
          className={'document-sheet' + (area ? ' select-area' : '')}
          style={{ width: Math.max(1, Math.round(width * zoom)) }}
          tabIndex={area && ready ? 0 : undefined}
          aria-label={
            area
              ? t(
                  'Zone du document. Flèches pour déplacer le cadre, Maj et flèches pour le redimensionner.',
                )
              : undefined
          }
          onKeyDown={(e) => {
            if (
              !area ||
              !ready ||
              !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
            )
              return;
            e.preventDefault();
            const r =
              selection?.page === page && !selection.quote ? selection.rectangles[0] : undefined;
            const [x, y, right, bottom] = r ?? [0.25, 0.25, 0.5, 0.5];
            const dx = e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0;
            const dy = e.key === 'ArrowDown' ? 0.01 : e.key === 'ArrowUp' ? -0.01 : 0;
            if (e.shiftKey)
              select([
                [
                  x,
                  y,
                  Math.max(x + 0.005, clamp(right + dx)),
                  Math.max(y + 0.005, clamp(bottom + dy)),
                ],
              ]);
            else {
              const moveX = Math.min(1 - right, Math.max(-x, dx)),
                moveY = Math.min(1 - bottom, Math.max(-y, dy));
              select([[x + moveX, y + moveY, right + moveX, bottom + moveY]]);
            }
          }}
          onKeyUp={selectText}
          onPointerDown={(e) => {
            if (!area || !ready || e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = [e.clientX, e.clientY];
          }}
          onPointerMove={(e) => {
            if (start.current)
              setDrag(
                region(
                  ...start.current,
                  e.clientX,
                  e.clientY,
                  e.currentTarget.getBoundingClientRect(),
                ),
              );
          }}
          onPointerCancel={() => {
            start.current = null;
            setDrag(null);
          }}
          onPointerUp={(e) => {
            if (start.current) {
              const r = region(
                ...start.current,
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              );
              start.current = null;
              setDrag(null);
              if (r[2] > r[0] && r[3] > r[1]) select([r]);
            } else selectText();
          }}
        >
          {url && (
            <img
              src={url}
              alt={source.title}
              draggable={false}
              onLoad={() => setReady(true)}
              onError={() => fail(t('Document indisponible.'))}
            />
          )}
          {pdf && width > 0 && (
            <DocumentPage
              pdf={pdf}
              number={page}
              width={Math.round(width * zoom)}
              onReady={painted}
              onError={fail}
            />
          )}
          {ready &&
            shown.map(([x, y, right, bottom], i) => (
              <mark
                key={i}
                style={{
                  left: x * 100 + '%',
                  top: y * 100 + '%',
                  width: (right - x) * 100 + '%',
                  height: (bottom - y) * 100 + '%',
                }}
              />
            ))}
        </div>
      </div>
      {selection && <blockquote>{selection.quote || t('Zone sélectionnée')}</blockquote>}
      {linkError && <p role="alert">{localizeMessage(linkError)}</p>}
      <button
        disabled={!onLink || !selection || !ready || !!error || saving}
        onClick={async () => {
          if (!onLink || !selection || saving) return;
          setSaving(true);
          setLinkError('');
          try {
            await onLink(selection);
          } catch (e) {
            setLinkError(String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        {replacing ? t('Confirmer le nouveau lien') : t('Relier au passage du manuscrit')}
      </button>
    </section>
  );
}
