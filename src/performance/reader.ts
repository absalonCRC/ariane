// Opt-in exercise of the packaged WKWebView and its native project transport.
import { invoke } from '@tauri-apps/api/core';
import { EditorView } from '@codemirror/view';
import type { Workspace } from '../app/useWorkspace';
import { request } from '../platform/client';
import { t } from '../i18n';
let w: Workspace,
  started = false;
const evidence: Record<string, unknown> = {};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const report = (status: string) =>
  invoke('performance', { action: 'report', payload: { ...evidence, status } });
async function wait<T>(get: () => T, label: string) {
  const start = performance.now();
  let v = get();
  while (!v) {
    if (performance.now() - start > 12000)
      throw Error(
        label +
          ' ' +
          document.querySelector(
            '.document-viewer [role="alert"],.annotation-margin [role="alert"]',
          )?.textContent,
      );
    await pause(40);
    v = get();
  }
  return v;
}
function check(ok: unknown, label: string) {
  if (!ok) throw Error(label);
  evidence[label] = true;
}
function button(label: string, scope: ParentNode = document) {
  return Array.from(scope.querySelectorAll('button')).find(
    (b) =>
      (b.textContent?.includes(t(label)) || b.getAttribute('aria-label') === t(label)) &&
      !b.disabled && !b.closest('[inert]'),
  );
}
async function openAnnotation(note: string) {
  const article = await wait(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('.annotation-margin article')).find(
        (card) =>
          Array.from(card.querySelectorAll('.annotation-tab, p')).some(
            (label) => label.textContent === note,
          ),
      ),
    'annotation ' + note,
  );
  article.querySelector<HTMLButtonElement>('.annotation-tab[aria-expanded="false"]')?.click();
  await wait(() => article.querySelector('p')?.textContent === note, 'expanded ' + note);
  return article;
}
async function run() {
  const fresh = !w.p;
  if (fresh) {
    const path = await invoke<string>('performance', { action: 'prepareReader' });
    w.activate(await request('open', { path }));
  }
  await wait(
    () => w.p?.name === 'Sources synthétiques 080' && w.editor.current,
    'synthetic project',
  );
  const path = w.p!.path;
  const capture = await invoke<boolean>('performance', { action: 'readerCapture' });
  async function checkpoint(label: string) {
    if (!capture) return;
    evidence.checkpoint = label;
    await report('capture');
    const deadline = performance.now() + 20000;
    while (!(await invoke('performance', { action: 'readerAcknowledged', payload: label }))) {
      if (performance.now() >= deadline) throw Error('Capture pending: ' + label);
      await pause(100);
    }
    delete evidence.checkpoint;
  }
  if (fresh) {
    const first = w.p!.sections[0];
    check(first.text === '', 'empty project');
    w.editor.current!.insert('Premier passage[^1].\n\n[^1]: Référence de la première scène.');
    await w.doc.flush();
    await w.createPage(null);
    await wait(() => w.newSection?.kind === 'scene', 'name new scene');
    w.setNewTitle('Seconde scène');
    await wait(() => w.newTitle === 'Seconde scène', 'scene title');
    await w.add();
    await wait(() => w.selected?.title === 'Seconde scène' && !w.newSection, 'second scene');
    check(w.p!.sections.length === 2, 'two scenes');
  }
  const view = EditorView.findFromDOM(
    document.querySelector<HTMLElement>('.manuscript-column .cm-editor')!,
  )!;
  const notes = () => request('annotations', { projectPath: path });
  if (fresh) {
    await wait(() => view.state.doc.length === 0, 'empty second scene');
    w.editor.current!.insert('Manuscrit 😀 avec note[^1].\n\n[^1]: Une référence locale.');
    await w.doc.flush();
    view.dispatch({ selection: { anchor: 0, head: 9 } });
    const marker = await wait(
      () => document.querySelector<HTMLElement>('[data-footnote-at]'),
      'footnote marker',
    );
    marker.focus();
    if (capture) await checkpoint('native-enter');
    else marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(
      document.querySelector('.footnote-reading')?.textContent === 'Une référence locale.',
      'inline definition',
    );
    const active = document.activeElement as HTMLElement;
    if (capture) await checkpoint('native-space');
    else active.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    check(
      !document.querySelector('.footnote-reading') &&
        document.activeElement?.hasAttribute('data-footnote-at'),
      'focus restored',
    );
    if (capture) evidence.systemKeyboardEvents = true;
    const sources = (await request('browseSources', { offset: 0, query: '' })).items;
    for (const name of ['Texte', 'Scan', 'Image']) {
      const source = sources.find((s) => s.path.startsWith(name))!;
      if (!source) throw Error('Missing ' + name + ': ' + sources.map((s) => s.path));
      const started = performance.now();
      await w.read({ ...source, page: name === 'Texte' ? 2 : 1 });
      const sheet = await wait(
        () => document.querySelector<HTMLElement>('.document-sheet'),
        'reader',
      );
      await wait(
        () => !document.querySelector('.document-viewer [role=status]') && sheet.offsetHeight > 4,
        'render ' + name,
      );
      evidence['renderMilliseconds ' + name] = Math.round(performance.now() - started);
      await pause(200);
      if (name === 'Texte') {
        const spans = sheet.querySelectorAll('.document-text span');
        check(spans.length >= 2, 'native PDF text layer');
        evidence.rotation = sheet
          .querySelector('.document-text')
          ?.getAttribute('data-main-rotation');
        const range = new Range();
        range.setStart(spans[0].firstChild!, 0);
        range.setEndAfter(spans[1]);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        sheet.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      } else {
        sheet.focus({ preventScroll: true });
        sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        sheet.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }),
        );
        check(document.activeElement === sheet, 'area keyboard focus ' + name);
      }
      (await wait(() => button('Relier au passage du manuscrit'), 'selection ' + name))!.click();
      const input = await wait(
        () => document.querySelector<HTMLTextAreaElement>('.annotation-margin textarea'),
        'annotation form',
      );
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        'Note ' + name,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (await wait(() => button('Ajouter l’annotation'), 'save note'))!.click();
      await openAnnotation('Note ' + name);
      w.setAnnotationsOpen(false);
      await pause(100);
    }
  }
  const saved = await notes();
  check(saved.length === 3 && saved.every((a) => a.document), 'three persisted anchors');
  for (const a of saved) {
    if (!w.annotationsOpen) w.openAnnotations();
    const article = await openAnnotation(a.note);
    const target = await wait(
      () => button('Retrouver la source', article),
      'annotation link',
    );
    target.click();
    await wait(() => document.querySelector('.document-sheet mark'), 'revealed ' + a.note);
    if (fresh && a.note === 'Note Texte') await checkpoint('pdf-100');
    const before = document.querySelector('.document-sheet mark')!.getBoundingClientRect();
    button('Augmenter le zoom')!.click();
    await pause(450);
    const after = document.querySelector('.document-sheet mark')!.getBoundingClientRect();
    check(after.width > before.width, 'zoom ' + a.note);
    if (a.note === 'Note Texte') {
      if (fresh) await checkpoint('pdf-125');
      check(a.document!.rectangles.length === 2 && a.document!.quote.includes('\n'), 'two text fragments');
      const span = document.querySelector('.document-text span')!;
      const range = new Range();
      range.selectNodeContents(span);
      const text = range.getBoundingClientRect();
      check(
        Math.abs(after.left - text.left) < 3 && Math.abs(after.top - text.top) < 3,
        'zoomed fragment alignment',
      );
    }
    check(
      document.querySelectorAll('.document-sheet mark').length === a.document!.rectangles.length,
      'rectangles ' + a.note,
    );
    button('Fermer la source', document.querySelector('.document-reader')!)!.click();
    await wait(() => !document.querySelector('.document-reader'), 'close reader');
  }
  if (!fresh) {
    await invoke('performance', { action: 'resize', payload: { width: 760 } });
    w.appearance.change('light');
    w.setAnnotationsOpen(false);
    if (!w.doc.settings.immersiveFocus) w.toggleFocus();
    await wait(() => document.querySelector('.app[data-focus="true"]'), 'immersive mode');
    const image = (await request('browseSources', { query: '', kind: 'Image', offset: 0 }))
      .items[0];
    await w.read(image);
    await wait(
      () =>
        document.querySelector('.document-sheet img') &&
        !document.querySelector('.document-viewer [role=status]'),
      'small reader',
    );
    await pause(400);
    const left = document.querySelector('.manuscript-column')!.getBoundingClientRect();
    const right = document.querySelector('.document-reader')!.getBoundingClientRect();
    evidence.smallWindow = { width: innerWidth, left: right.left, manuscriptRight: left.right };
    check(left.right <= right.left + 1 && left.width > 160, 'narrow split');
    const instance = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!);
    const original = view.state.doc.toString();
    view.dispatch({ changes: { from: 0, insert: 'X' } });
    button('Fermer la source', document.querySelector('.document-reader')!)!.click();
    await wait(() => document.querySelector('.app[data-focus="true"]'), 'return to focus');
    const { undo } = await import('@codemirror/commands');
    check(
      instance === view && undo(view) && view.state.doc.toString() === original,
      'edit and undo across focus',
    );
    w.toggleFocus();
    await w.doc.flush();
    const recovery = await invoke<{ restored: string; old: string | null } | null>('performance', {
      action: 'readerRecovery',
    });
    if (recovery) {
      const doc = saved.find((a) => a.document?.path === 'Texte.pdf')!.document!;
      let refused = false;
      try {
        await request('sourceFile', { id: doc.sourceId, fingerprint: doc.fingerprint });
      } catch {
        refused = true;
      }
      check(refused, 'changed bytes refused before rescan');
      await request('index');
      const catalog = await request('browseSources', { offset: 0, query: '', kind: 'PDF' });
      const moved = catalog.items.find((s) => s.path === 'Texte déplacé.pdf');
      check(
        moved?.fingerprint === doc.fingerprint && moved.id !== doc.sourceId,
        'moved copy detected',
      );
      w.openAnnotations();
      const article = await openAnnotation('Note Texte');
      const oldLink = await wait(() => button('Retrouver la source', article), 'stale link');
      oldLink.click();
      await wait(
        () => document.querySelector('.annotation-margin [role=alert]'),
        'changed source warning',
      );
      check(!document.querySelector('.document-sheet mark'), 'stale highlight withheld');
      const pdfGroup = await wait(
        () =>
          Array.from(article.querySelectorAll<HTMLButtonElement>('.entity-type-heading')).find(
            (b) => b.textContent?.includes('PDF'),
          ),
        'reconnection catalog',
      );
      pdfGroup.click();
      (
        await wait(
          () => article.querySelector<HTMLButtonElement>('[title="Texte déplacé.pdf"]'),
          'moved PDF',
        )
      ).click();
      await wait(() => document.querySelector('.document-text span'), 'replacement first page');
      button('Page suivante', document.querySelector('.document-viewer')!)!.click();
      await wait(
        () => !document.querySelector('.document-viewer [role=status]') &&
          document.querySelector('.document-controls')?.textContent?.includes('2 / 2'),
        'replacement page ready',
      );
      const line = await wait(
        () =>
          Array.from(document.querySelectorAll('.document-text span')).find((el) =>
            el.textContent?.includes('Citation'),
          ),
        'replacement second page',
      );
      const range = new Range();
      range.selectNodeContents(line);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      document
        .querySelector('.document-sheet')!
        .dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      (await wait(() => button('Confirmer le nouveau lien'), 'replacement confirmation')).click();
      await wait(() => document.querySelector('.annotation-margin article'), 'updated annotation');
      const repaired = (await notes()).find((a) => a.note === 'Note Texte')!;
      check(
        repaired.id === saved.find((a) => a.note === 'Note Texte')!.id &&
          repaired.document?.sourceId === moved!.id,
        'explicit reconnection',
      );
      for (const target of [recovery.restored, recovery.old, path].filter(
        (s): s is string => !!s,
      )) {
        await w.openProject(target);
        await wait(() => w.p?.path === target && w.editor.current, 'switch project');
        if (target === recovery.restored) {
          check(
            (await request('annotations', { projectPath: target })).length === 3,
            'backup restored',
          );
          check(
            (await request('vaults')).some((v) => v.needsAuthorization),
            'restored vault requires consent',
          );
          const bytes = await request('sourceFile', { id: doc.sourceId }).catch(() => null);
          check(!bytes, 'restored source blocked');
        }
        if (target === recovery.old)
          check(
            w.p!.sections.some((s) => s.text.length > 0),
            'older project opened',
          );
      }
      check(
        (await notes()).find((a) => a.note === 'Note Texte')?.document?.sourceId === moved!.id,
        'reconnected after project switch',
      );
    }
  }
  evidence.phase = fresh ? 'creation' : 'restart';
  evidence.anchors = saved;
  await report('pass');
}
export function attachReader(workspace: Workspace) {
  w = workspace;
  if (!w.ready || started) return;
  started = true;
  void run().catch(async (e) => {
    evidence.error = String(e);
    evidence.stack = e.stack;
    evidence.interface = {
      reader: w.reader?.path,
      annotations: w.annotationsOpen,
      controls: document.querySelector('.document-controls')?.textContent,
      alerts: Array.from(document.querySelectorAll('[role=alert]'), (el) => el.textContent),
      surface: w.surface,
    };
    await report('error');
  });
}
