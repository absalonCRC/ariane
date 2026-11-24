// Opt-in native rehearsal on a marked, synthetic profile.
import { invoke } from '@tauri-apps/api/core';
import { EditorView } from '@codemirror/view';
import type { Workspace } from '../app/useWorkspace';
import { request } from '../platform/client';
import { t } from '../i18n';
let workspace: Workspace;
let started = false;
const text = 'Elena guarda la carta en el cajón.';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait<T>(read: () => T, label: string, timeout = 30000) {
  const until = Date.now() + timeout;
  do {
    const result = read();
    if (result) return result;
    const error = document.querySelector('.model-error');
    if (error) throw Error(error.textContent || label);
    await pause(80);
  } while (Date.now() < until);
  const current = editor();
  throw Error(label + ' ' + JSON.stringify({
    documentFocus: document.hasFocus(), editorFocus: current?.hasFocus,
    active: document.activeElement?.className, selection: current?.state.selection.main.toJSON(),
    buttons: [...document.querySelectorAll('.selection-toolbar button')].map((el) => el.getAttribute('aria-label')),
  }));
}
async function capture(stage: string) {
  if (import.meta.env.VITE_MODEL_SCREENSHOTS !== '1') return;
  await invoke('performance', { action: 'report', payload: { stage } });
  await pause(7000);
}
function button(label: string, root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) =>
      (b.textContent?.trim() === t(label) || b.getAttribute('aria-label') === t(label)) &&
      !b.disabled,
  );
}
function editor() {
  const root = document.querySelector<HTMLElement>('.manuscript-column .cm-editor');
  return root && EditorView.findFromDOM(root);
}
function pickerLanguage(lang: string) {
  const select = document.querySelector<HTMLSelectElement>('.voice-picker select')!;
  select.value = lang;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
async function downloadVoice() {
  const download = await wait(
    () =>
      [...document.querySelectorAll<HTMLButtonElement>('.voice-picker button')].find(
        (b) => !b.disabled && b.textContent?.includes(t('Télécharger')),
      ),
    'Download voice',
  );
  download.click();
  await wait(() => document.querySelector('.voice-preview .model-ready'), 'Install voice', 600000);
}
function capsule(key: string) {
  return document.querySelector<HTMLElement>(
    `.window-title .path-heading [data-model-request="${key}"]`,
  );
}
async function dismiss(key: string) {
  const row = capsule(key)?.closest('.path-notice-row');
  if (!row) throw Error('Missing capsule ' + key);
  button('Fermer la notification', row)!.click();
  await wait(() => !capsule(key), 'Close ' + key);
}
function checkGeometry(key: string) {
  const controls = capsule(key)!;
  const bounds = controls.closest('.path-heading')!.getBoundingClientRect();
  const close = controls
    .closest('.path-notice-row')!
    .querySelector('.title-notice-close')!
    .getBoundingClientRect();
  if (
    controls.getBoundingClientRect().left < bounds.left - 1 ||
    close.right > bounds.right + 1 ||
    Math.abs((bounds.left + bounds.right) / 2 - window.innerWidth / 2) > 2
  )
    throw Error(
      'Clipped or off-center controls: ' +
        JSON.stringify({
          key,
          left: bounds.left,
          right: bounds.right,
          close: close.right,
          width: window.innerWidth,
        }),
    );
}
async function run() {
  const initial = await request('runtimeModules');
  if (workspace.p) {
    if (
      workspace.p.name !== 'Sources synthétiques 080' ||
      document.querySelector('dialog[open]') ||
      workspace.p.sections[0].text !== text ||
      initial.installed.length !== 4 ||
      document.querySelector('[data-model-request]') ||
      !initial.installed.includes('readingEs')
    )
      throw Error('Unexpected restored session');
    return { status: 'pass', reopened: true, installed: initial.installed, text };
  }
  if (
    initial.installed.join() !== 'semantic' ||
    initial.active ||
    !(await request('engineStatus')).available
  )
    throw Error('Expected only the bundled semantic model');
  await wait(() => button('Créer un projet'), 'Welcome');
  if (document.querySelector('dialog[open]')) throw Error('Unexpected onboarding dialog');
  (await wait(() => button('Modèles locaux'), 'Welcome models')).click();
  await wait(() => capsule('catalog'), 'Welcome capsule');
  await pause(500);
  checkGeometry('catalog');
  if (document.querySelector('dialog[open]')) throw Error('Modal model picker');
  await capture('accueil');
  await dismiss('catalog');
  const path = await invoke<string>('performance', { action: 'prepareReader' });
  workspace.activate(await request('open', { path }));
  const view = await wait(
    () => (workspace.p?.name === 'Sources synthétiques 080' ? editor() : null),
    'Empty editor',
  );
  if (view.state.doc.length) throw Error('Expected an empty manuscript');
  const prefix = 'Elena guarda';
  view.dispatch({ changes: { from: 0, insert: prefix } });
  (await wait(() => button('Installer la dictée'), 'Microphone setup')).click();
  await wait(() => capsule('voice'), 'Dictation capsule');
  view.focus();
  view.dispatch({ changes: { from: prefix.length, insert: text.slice(prefix.length) } });
  await workspace.doc.flush();
  await pause(6100);
  if (!capsule('voice') || document.querySelector('dialog[open]'))
    throw Error('Dictation request lost or blocking');
  await capture('dictee');
  workspace.setSurface('preferences');
  await wait(
    () => workspace.surface === 'preferences' && capsule('voice'),
    'Persist in preferences',
  );
  workspace.setSurface('none');
  await wait(() => workspace.surface === 'none' && capsule('voice'), 'Return to writing');
  await dismiss('voice');
  await invoke('performance', { action: 'resize', payload: { width: 760 } });
  function selectPassage() {
    const current = editor()!;
    current.focus();
    current.dispatch({ selection: { anchor: 0, head: text.length } });
  }
  selectPassage();
  (await wait(() => button('Choisir une voix de lecture'), 'First use')).click();
  const select = await wait(() => capsule('reading')?.querySelector('select'), 'Voice choice');
  select.focus();
  select.value = 'readingEs';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await pause(600);
  checkGeometry('reading');
  await capture('premiere-lecture');
  if (
    (await request('runtimeModules')).installed.join() !== 'semantic' ||
    document.querySelector('dialog[open]')
  )
    throw Error('Unexpected download or dialog');
  capsule('reading')!.querySelector('button')!.click();
  await wait(() => !capsule('reading'), 'Spanish voice installation', 600000);
  const installedAfterFirst = (await request('runtimeModules')).installed;
  if (installedAfterFirst.join() !== 'readingEs,semantic' || document.querySelector('.spoken-word'))
    throw Error('Unexpected first voice or automatic reading');
  await invoke('performance', { action: 'resize', payload: { width: 1200 } });
  await wait(() => window.innerWidth >= 1100, 'Expand window');
  await invoke('performance', { action: 'report', payload: { stage: 'relire' } });
  await pause(800);
  const current = editor()!;
  current.focus();
  current.dispatch({ selection: { anchor: text.length } });
  await pause(100);
  selectPassage();
  (await wait(() => button('Écouter la sélection'), 'Read selected passage')).click();
  const firstWord = await wait(
    () => document.querySelector('.spoken-word')?.textContent,
    'Word timing',
    60000,
  );
  if (firstWord !== 'Elena') throw Error('Unexpected highlighted word: ' + firstWord);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  workspace.setSurface('preferences');
  (await wait(() => button('Modèles locaux'), 'Settings')).click();
  await wait(() => document.querySelector('.model-library'), 'Models page');
  await capture('parametres');
  document.querySelector<HTMLElement>('.model-group summary')!.click();
  const samples = [];
  for (const [lang, phrase] of [
    ['fr', 'Élise retrouve la lettre.'],
    ['en', 'Anna finds the letter.'],
    ['es', text],
  ]) {
    pickerLanguage(lang);
    if (lang !== 'es') await downloadVoice();
    const id = crypto.randomUUID();
    await request('selectionSpeech', { id, active: true });
    try {
      const { audio, tokens } = await request('selectionAudio', {
        id,
        language: lang,
        text: phrase,
      });
      if (atob(audio).slice(0, 4) !== 'RIFF' || tokens.length < 2)
        throw Error('Invalid local speech');
      samples.push({ language: lang, bytes: atob(audio).length, tokens: tokens.length });
    } finally {
      await request('selectionSpeech', { id, active: false });
    }
  }
  pickerLanguage('auto');
  const installed = (await request('runtimeModules')).installed;
  if (installed.length !== 4 || installed.includes('voice')) throw Error('Unexpected extra model');
  return {
    status: 'pass',
    initial: initial.installed,
    installedAfterFirst,
    installed,
    firstWord,
    samples,
    text,
  };
}
export function attachModelSelection(w: Workspace) {
  workspace = w;
  if (!w.ready || started) return;
  started = true;
  void run()
    .catch((e) => ({ status: 'fail', error: String(e), stack: e.stack }))
    .then((payload) => invoke('performance', { action: 'report', payload }));
}
