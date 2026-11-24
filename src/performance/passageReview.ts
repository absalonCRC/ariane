// Opt-in WKWebView rehearsal on a marked synthetic project.
import { invoke } from '@tauri-apps/api/core';
import { EditorView } from '@codemirror/view';
import type { Workspace } from '../app/useWorkspace';
import { request } from '../platform/client';
import { captureAnchor } from '../project/annotations';
import { t } from '../i18n';
let workspace: Workspace,
  started = false;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait<T>(read: () => T, label: string) {
  for (let i = 0; i < 900; i++) {
    const value = read();
    if (value) return value;
    await pause(50);
  }
  throw Error(label + ' ' + document.querySelector('[role=alert]')?.textContent);
}
function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) =>
      (b.getAttribute('aria-label') === t(label) || b.textContent?.trim() === t(label)) &&
      !b.disabled &&
      !b.closest('[inert]'),
  );
}
function view() {
  const root = document.querySelector<HTMLElement>('.manuscript-column .cm-editor');
  return root && EditorView.findFromDOM(root);
}
async function run() {
  if (!workspace.p) {
    const path = await invoke<string>('performance', { action: 'prepareReader' });
    workspace.activate(await request('open', { path }));
  }
  await wait(
    () => workspace.p?.name === 'Sources synthétiques 080' && view(),
    'synthetic manuscript',
  );
  const path = workspace.p!.path;
  const notes = () => request('annotations', { projectPath: path });
  const branch = (await request('historyState', { projectPath: path })).activeBranch;
  const text = 'Élise revient demain. Paul attend.';
  const readings: {
    language: string;
    firstWord: string;
    secondWord: string;
    firstMarkMs: number;
  }[] = [];
  if (!(await notes()).length) {
    if (view()!.state.doc.length) throw Error('Expected an empty synthetic project');
    for (const [language, excerpt] of [
      ['en', 'Anna finds the letter by the window.'],
      ['es', 'Elena guarda la carta en el cajón.'],
      ['fr', text],
    ]) {
      workspace.doc.configure({ language });
      await wait(() => workspace.doc.settings.language === language, 'document language');
      view()!.dispatch({ changes: { from: 0, to: view()!.state.doc.length, insert: excerpt } });
      await workspace.doc.flush();
      view()!.focus();
      view()!.dispatch({ selection: { anchor: 0, head: excerpt.length } });
      const play = await wait(() => button('Écouter la sélection'), 'toolbar ' + language);
      const start = performance.now();
      play.click();
      const current = () => document.querySelector('.spoken-word')?.textContent;
      const firstWord = await wait(current, 'speech range ' + language);
      const firstMarkMs = Math.round(performance.now() - start);
      const secondWord = await wait(
        () => current() !== firstWord && current(),
        'second range ' + language,
      );
      if (!excerpt.includes(firstWord) || !excerpt.includes(secondWord as string))
        throw Error('Unexpected marked words');
      readings.push({ language, firstWord, secondWord: secondWord as string, firstMarkMs });
      if (language === 'fr')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(
        () => !document.querySelector('.spoken-word') && button('Écouter la sélection'),
        'speech ended ' + language,
      );
      if (view()!.state.doc.toString() !== excerpt) throw Error('Playback changed the text');
    }
    view()!.dispatch({ selection: { anchor: 0, head: 5 } });
    const scene = workspace.p!.sections[0];
    const origin = captureAnchor(scene, 0, 5);
    const { audio } = await invoke<{ audio: string }>('performance', { action: 'speechInput' });
    const transcription = await request('voiceTranscribe', {
      projectPath: path,
      audio,
      language: 'fr',
      live: true,
    });
    if (!transcription.text.trim()) throw Error('Empty local transcription');
    await request('passageAnnotation', {
      projectPath: path,
      branch,
      id: crypto.randomUUID(),
      action: { kind: 'dictation', origin, note: transcription.text },
    });
    for (const note of ['Revoir la date', 'Vérifier le quai'])
      await request('addAnnotation', {
        projectPath: path,
        branch,
        section: scene.id,
        from: 0,
        to: 5,
        revision: scene.revision,
        note,
      });
    await workspace.createPage(null);
    await wait(() => workspace.newSection?.kind === 'scene', 'new scene name');
    workspace.setNewTitle('Le quai');
    await wait(() => workspace.newTitle === 'Le quai', 'title captured');
    await workspace.add();
    await wait(
      () => workspace.selected?.title === 'Le quai' && view()?.state.doc.length === 0,
      'second scene',
    );
    workspace.editor.current!.insert('Paul rentre à pied.');
    await workspace.doc.flush();
    await workspace.select(scene.id);
    await wait(() => view()?.state.doc.toString() === text, 'first scene text');
    view()!.dispatch({ selection: { anchor: 0, head: 5 } });
    workspace.openAnnotations();
    (await wait(() => button('Nouer deux passages'), 'first endpoint')).click();
    await wait(() => button('Annuler le lien'), 'pending link');
    const peer = workspace.p!.sections.find((s) => s.title === 'Le quai')!;
    await workspace.select(peer.id);
    await wait(() => view()?.state.doc.toString() === 'Paul rentre à pied.', 'destination scene');
    view()!.dispatch({ selection: { anchor: 0, head: 4 } });
    workspace.openAnnotations();
    (await wait(() => button('Relier à cette sélection'), 'second endpoint')).click();
    await wait(() => !button('Annuler le lien'), 'saved link');
  } else workspace.openAnnotations();
  await invoke('performance', { action: 'resize', payload: { width: 760 } });
  const headers = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.annotation-tab'));
  await wait(() => headers().length === 3, 'three stacked annotations');
  const order = headers().map((b) => b.textContent);
  headers()[1].focus();
  headers()[1].click();
  await pause(400);
  const exposed = headers().every((b) => {
    const r = b.getBoundingClientRect();
    return b.contains(document.elementFromPoint(r.left + 12, r.top + r.height / 2));
  });
  headers()[1].click();
  await pause(100);
  const result = await notes();
  const relation = result.find((n) => n.peer);
  if (relation?.peer && relation.peer.section !== relation.section) {
    for (const [label, quote] of [
      ['Destination', 'Paul'],
      ['Origine', 'Élise'],
    ]) {
      const link = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.annotation-quote'),
      ).find((b) => b.textContent?.trim().startsWith(t(label)));
      if (!link || link.disabled) throw Error('Missing endpoint ' + label);
      link.click();
      await wait(() => {
        const v = view();
        return (
          v && v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.from + quote.length) === quote &&
          v.dom.querySelector('.cm-text-search-match.current')?.textContent === quote
        );
      }, 'jump ' + label);
    }
  }
  if (
    !exposed ||
    headers().some((b, i) => b.textContent !== order[i]) ||
    !result.some((n) => n.peer) ||
    workspace.p!.sections[0].text !== text
  )
    throw Error('Stack geometry, order, relation or manuscript mismatch');
  return {
    status: 'pass',
    readings,
    linkedScenes: relation?.peer?.section !== relation?.section,
    width: innerWidth,
    order,
    exposed,
    annotations: result.length,
    text,
  };
}
export function attachPassageReview(w: Workspace) {
  workspace = w;
  if (!w.ready || started) return;
  started = true;
  void run()
    .catch((e) => ({ status: 'fail', error: String(e), stack: e.stack }))
    .then((payload) => invoke('performance', { action: 'report', payload }));
}
