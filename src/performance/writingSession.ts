// Runs only in the opt-in native build and its marked synthetic profile.
import { invoke } from '@tauri-apps/api/core';
import { EditorView } from '@codemirror/view';
import { isolateHistory, undo } from '@codemirror/commands';
import type { Workspace } from '../app/useWorkspace';
import { request } from '../platform/client';
import { t } from '../i18n';

let app: Workspace,
  started = false;
const checks: string[] = [];
function check(ok: unknown, label: string) {
  if (!ok) throw Error(label);
  checks.push(label);
}
async function until<T>(read: () => T, label: string): Promise<NonNullable<T>> {
  const end = performance.now() + 15000;
  for (;;) {
    const result = read();
    if (result) return result;
    if (performance.now() > end) throw Error(label);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}
function command(id: string) {
  const item = app.commands.find((c) => c.id === id);
  if (!item) throw Error(id);
  item.action();
}
function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) =>
      !b.closest('[inert]') &&
      (b.getAttribute('aria-label') === t(label) || b.textContent?.trim() === t(label)),
  );
}
const note = 'Revoir la lumière de cette fenêtre.';
async function run() {
  const fresh = !app.p;
  if (fresh) {
    const path = await invoke<string>('performance', { action: 'prepareReader' });
    app.activate(await request('open', { path }));
  }
  await until(
    () => app.p?.name === 'Sources synthétiques 080' && app.editor.current,
    'synthetic project',
  );
  const settings = () => app.doc.settingsRef.current;
  const root = () => document.querySelector<HTMLElement>('.cm-editor');
  const scene = app.p!.sections[0].id;
  let phase = fresh ? 'creation' : 'reopening';
  if (fresh) {
    await until(() => root() && app.landmarkActions.current, 'writing controls');
    check(app.editor.current!.text() === '', 'empty manuscript');
    app.doc.configure({ projectGoal: 12, sessionGoal: 5 });
    app.editor.current!.insert('La lune revient');
    await until(() => root() && app.editor.current!.text() === 'La lune revient', 'typed text');
    const view = EditorView.findFromDOM(root()!)!;
    const end = view.state.doc.length;
    view.dispatch({
      changes: { from: end, insert: ' ici' },
      selection: { anchor: end + 4 },
      annotations: isolateHistory.of('full'),
    });
    undo(view);
    check(settings().sessionWords === 3, 'write and undo count net words');
    const last = settings().lastEdit!;
    check(
      last.section === scene && last.position === 15 && last.branch === 'main',
      'scene-relative last edit',
    );
    command('tomorrow-note');
    const field = await until(
      () => document.querySelector<HTMLTextAreaElement>('dialog textarea'),
      'intention dialog',
    );
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, note);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    (
      await until(
        () => document.querySelector<HTMLButtonElement>('dialog button.primary:not(:disabled)'),
        'intention save',
      )
    ).click();
    await until(() => settings().tomorrow?.text === note, 'stored private note');
    await app.createPage(null);
    await until(() => app.newSection, 'new scene form');
    app.setNewTitle('Lecture');
    await until(() => app.newTitle === 'Lecture', 'new title');
    await app.add();
    await until(() => app.active !== scene && app.editor.current?.text() === '', 'second scene');
    check(settings().lastEdit?.section === scene, 'navigation preserves edit');
    command('last-edit');
    await until(
      () => app.active === scene && app.editor.current?.cursor() === last.position,
      'last-edit command',
    );
    check(app.editor.current!.text() === 'La lune revient', 'manuscript excludes private note');
    const pdf = (await request('browseSources', { offset: 0, query: '', kind: 'PDF' })).items.find(
      (s) => s.path.startsWith('Texte'),
    );
    if (!pdf) throw Error('fixture PDF');
    await app.read({ ...pdf, page: 2 });
    await until(() => document.querySelector('.document-text span'), 'native PDF text');
    button('Augmenter le zoom')!.click();
    await until(() => settings().documentPosition?.zoom === 1.25, 'PDF zoom stored');
    const frame = document.querySelector<HTMLElement>('.document-scroll')!;
    frame.scrollTo(24, 74);
    await until(() => (settings().documentPosition?.top ?? 0) >= 70, 'PDF scroll stored');
    check(settings().documentPosition?.page === 2, 'PDF page stored');
  } else if (settings().tomorrow?.text === note) {
    await until(() => document.querySelector('.document-text span'), 'PDF restored');
    check(
      document.querySelector('.document-controls')?.textContent?.includes('125 %') &&
        settings().documentPosition?.page === 2,
      'reopened PDF page and zoom',
    );
    await until(
      () => (document.querySelector<HTMLElement>('.document-scroll')?.scrollTop ?? 0) >= 70,
      'PDF scroll restored',
    );
    check(
      settings().sessionWords === 3 &&
        settings().projectGoal === 12 &&
        settings().sessionGoal === 5,
      'reopened goals',
    );
    check(settings().tomorrow?.text === note, 'private intention survived restart');
    app.setReader(null);
    command('last-edit');
    await until(
      () => app.editor.current?.cursor() === 15 && document.querySelector('.tomorrow-margin'),
      'restored anchor in margin',
    );
    command('tomorrow-note');
    (await until(() => button('Effacer le mot'), 'delete intention')).click();
    await until(() => settings().tomorrow === null, 'intention removed');
    check(app.editor.current?.text() === 'La lune revient', 'deleting intention preserves text');
    const image = (await request('browseSources', { offset: 0, query: '', kind: 'Image' }))
      .items[0];
    if (!image) throw Error('fixture image');
    await app.read(image);
    await until(
      () => document.querySelector<HTMLImageElement>('.document-sheet img')?.naturalWidth,
      'image loaded',
    );
    button('Augmenter le zoom')!.click();
    await until(() => settings().documentPosition?.zoom === 1.25, 'image zoom stored');
  } else {
    await until(
      () =>
        document.querySelector<HTMLImageElement>('.document-sheet img')?.naturalWidth ||
        !settings().documentPosition,
      'restore or dismiss image',
    );
    if (settings().documentPosition) {
      check(
        document.querySelector('.document-controls')?.textContent?.includes('125 %'),
        'reopened image zoom',
      );
      phase = 'image';
    } else {
      await until(
        () => !app.reader && app.editor.current?.text() === 'La lune revient',
        'fallback to manuscript',
      );
      check(!app.reader && !settings().documentPosition, 'missing source dismissed');
      phase = 'missing-source';
    }
  }
  await app.doc.checkpoint();
  return phase;
}
export function attachWritingSession(workspace: Workspace) {
  app = workspace;
  if (started || !workspace.ready) return;
  started = true;
  void run().then(
    (phase) =>
      invoke('performance', { action: 'report', payload: { status: 'pass', phase, checks } }),
    (error) =>
      invoke('performance', {
        action: 'report',
        payload: { status: 'error', error: String(error), checks },
      }),
  );
}
