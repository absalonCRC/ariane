import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import { t } from '../i18n';

export async function loadPdf(url: string, signal: AbortSignal) {
  // WKWebView's custom scheme supports explicit ranges, including large local documents.
  const head = await fetch(url, { method: 'HEAD', signal });
  const length = Number(head.headers.get('Content-Length'));
  if (!head.ok || !Number.isSafeInteger(length) || length <= 0 || length > 100_000_000)
    throw new Error(t('Document indisponible.'));
  const data = new Uint8Array(length);
  for (let start = 0; start < length;) {
    const end = Math.min(start + 4 * 1024 * 1024, length) - 1;
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal });
    if (response.status !== 206) throw new Error(t('Document indisponible.'));
    const chunk = new Uint8Array(await response.arrayBuffer());
    if (chunk.length !== end - start + 1) throw new Error(t('Document indisponible.'));
    data.set(chunk, start);
    start = end + 1;
  }
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: worker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  signal.throwIfAborted();
  pdf.GlobalWorkerOptions.workerSrc = worker;
  const base = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : '/pdf-assets/';
  const task = pdf.getDocument({
    data,
    cMapUrl: base + 'cmaps/',
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    iccUrl: base + 'iccs/',
    useWorkerFetch: false,
  });
  signal.addEventListener(
    'abort',
    () => {
      void task.destroy().catch(() => {});
    },
    { once: true },
  );
  return task.promise;
}

export function DocumentPage({
  pdf,
  number,
  width,
  onReady,
  onError,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  onReady: (hasText: boolean) => void;
  onError: (error: unknown) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    let alive = true,
      render: RenderTask | undefined,
      layer: TextLayer | undefined;
    async function paint() {
      const [page, { TextLayer }] = await Promise.all([
        pdf.getPage(number),
        import('pdfjs-dist/legacy/build/pdf.mjs'),
      ]);
      if (!alive) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / original.width });
      const canvas = document.createElement('canvas');
      // Keep extreme page aspect ratios within the WebKit canvas budget.
      const density = Math.min(
        devicePixelRatio,
        8192 / Math.max(width, viewport.height),
        Math.sqrt(12_000_000 / (width * viewport.height)),
      );
      canvas.width = Math.max(1, Math.round(width * density));
      canvas.height = Math.max(1, Math.round(viewport.height * density));
      el.style.height = viewport.height + 'px';
      const text = document.createElement('div');
      text.className = 'document-text';
      text.style.setProperty('--total-scale-factor', String(viewport.scale * page.userUnit));
      el.replaceChildren(canvas, text);
      render = page.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0] });
      const rendered = render.promise;
      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport,
      });
      await Promise.all([rendered, layer.render()]);
      if (alive) onReady(!!text.textContent?.trim());
    }
    void paint().catch((e) => {
      if (alive) onError(e);
    });
    return () => {
      alive = false;
      render?.cancel();
      layer?.cancel();
      el.replaceChildren();
    };
  }, [pdf, number, width, onReady, onError]);
  return <div ref={host} className="document-pdf" />;
}
