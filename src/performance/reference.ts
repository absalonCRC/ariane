import { invoke } from '@tauri-apps/api/core';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import type { Workspace } from '../app/useWorkspace';
import type { IndexReport } from '../contracts/requests';
import { request } from '../platform/client';

interface Fixture {
  path: string;
  other: string;
  scenes: number;
  sources: number;
}
type IndexedBatch = IndexReport & {
  indexed: number;
  deferred: boolean;
  ms: number;
  dispatch: number[];
  nextFrame: number[];
};

const marker = 'Témoin Ariane';
const now = () => performance.now();
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let workspace: Workspace;
let started = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor(label: string, verify: () => unknown) {
  const start = now();
  while (!verify()) {
    assert(now() - start < 25_000, 'Timed out: ' + label);
    await frame();
  }
}

function editor() {
  const handle = workspace.editor.current;
  assert(handle, 'Editor not mounted');
  return handle;
}

function visibleEditor(path: string) {
  return (
    workspace.p?.path === path &&
    workspace.editor.current &&
    document.querySelector('.manuscript-column .cm-editor')?.getClientRects().length
  );
}

function report(payload: Record<string, unknown>) {
  return invoke('performance', { action: 'report', payload });
}

async function settle() {
  const start = now();
  // Let debounced workspace effects start before looking for outstanding work.
  await delay(600);
  while (!(await invoke<boolean>('performance', { action: 'referenceIdle' }))) {
    assert(now() - start < 60_000, 'Project did not settle in 60 seconds');
    await delay(100);
  }
  return now() - start;
}

async function typeAtDisplayRate(count: number, overlapping?: () => boolean) {
  const dispatch: number[] = [];
  const nextFrame: number[] = [];
  for (let step = 0; step < count; step++) {
    const active = !overlapping || overlapping();
    const start = now();
    editor().insert('a');
    const committed = now();
    await frame();
    if (active) {
      dispatch.push(committed - start);
      nextFrame.push(now() - start);
    }
  }
  return { dispatch, nextFrame };
}

export function attachReference(current: Workspace) {
  workspace = current;
  if (started || !current.ready) return;
  started = true;
  const evidence: Record<string, unknown> = {
    navigationTimeOrigin: performance.timeOrigin,
    workspaceReadyMs: now(),
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
  };
  void run(evidence).then(
    () => request('quit'),
    (error: unknown) =>
      report({ ...evidence, status: 'error', error: String(error) }).then(() => request('quit')),
  );
}

async function run(evidence: Record<string, unknown>) {
  if (workspace.p) {
    evidence.phase = 'restart';
    const path = workspace.p.path;
    await waitFor('restored editor', () => visibleEditor(path));
    await frame();
    await frame();
    evidence.editorReadyMs = now();
    assert(editor().text().includes(marker), 'Persisted text not restored');
    evidence.cursor = editor().cursor();
    evidence.scene = editor().context()?.section;
    assert(!workspace.error, workspace.error);
    await report({ ...evidence, status: 'pass' });
    return;
  }

  await frame();
  await frame();
  evidence.homeReadyMs = now();
  evidence.phase = 'prepare';
  await report({ ...evidence, status: 'running' });
  const fixture = await invoke<Fixture>('performance', { action: 'prepareReference' });
  evidence.fixture = fixture;
  evidence.phase = 'open';
  const start = now();
  const project = await request('open', { path: fixture.path });
  evidence.firstOpenIpcMs = now() - start;
  workspace.activate(project);
  await waitFor('fresh editor', () => visibleEditor(fixture.path));
  await frame();
  await frame();
  evidence.firstOpenEditorMs = now() - start;
  evidence.characters = project.sections.reduce((sum, section) => sum + section.text.length, 0);
  evidence.sceneCharacters = editor().text().length;

  evidence.phase = 'settle after first open';
  await report({ ...evidence, status: 'running' });
  evidence.firstSettleMs = await settle();
  evidence.phase = 'edit';
  editor().focus();
  editor().insert(' ' + marker + ' ');
  const idle = [];
  const save = [];
  for (let burst = 0; burst < 3; burst++) {
    await frame();
    idle.push(await typeAtDisplayRate(30));
    const saveStart = now();
    await workspace.doc.flush();
    save.push(now() - saveStart);
  }
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
  const edited = editor().text();
  assert(undo(view) && editor().text() !== edited, 'Undo did not change the text');
  assert(redo(view) && editor().text() === edited, 'Redo did not restore the text');
  evidence.idle = idle;
  evidence.saveMs = save;
  evidence.undoRedo = true;
  await workspace.doc.flush();

  evidence.phase = 'search';
  const searchMs = [];
  for (let sample = 0; sample < 8; sample++) {
    const term = sample % 2 === 0 ? 'mémoire des lieux' : 'dans Toulouse';
    const searchStart = now();
    editor().findText(term, 'first');
    assert(editor().selection() === term, 'Manuscript search did not select ' + term);
    await frame();
    searchMs.push(now() - searchStart);
    editor().clearTextSearch();
  }
  evidence.manuscriptSearchMs = searchMs;
  const sourcesMs = [];
  for (let sample = 0; sample < 8; sample++) {
    const sourceStart = now();
    const hits = await request('search', { query: 'Toulouse' });
    assert(
      hits.some((source) => source.title === 'Toulouse'),
      'Expected source not found',
    );
    sourcesMs.push(now() - sourceStart);
  }
  evidence.sourceSearchMs = sourcesMs;

  evidence.phase = 'compare';
  await report({ ...evidence, status: 'running' });
  const comparisons = [];
  for (let sample = 0; sample < 5; sample++) {
    const compareStart = now();
    workspace.setSurface('history');
    await waitFor('comparison with expected added text', () =>
      document.querySelector('.history-editor')?.textContent?.includes(marker),
    );
    assert(document.querySelector('.history-editor .diff-added'), 'Missing comparison change');
    await frame();
    comparisons.push(now() - compareStart);
    workspace.setHistoryMode(false);
    await waitFor(
      'editor after comparison',
      () => visibleEditor(fixture.path) && !document.querySelector('.history-editor'),
    );
  }
  evidence.comparisonMs = comparisons;

  evidence.phase = 'switch';
  const switches: { target: string; ms: number }[] = [];
  evidence.switches = switches;
  await report({ ...evidence, status: 'running' });
  for (const path of Array.from({ length: 3 }, () => [fixture.other, fixture.path]).flat()) {
    await settle();
    const target = path === fixture.path ? 'fixture' : 'secondary';
    const switchStart = now();
    await workspace.openProject(path);
    await waitFor('active project ' + target, () => workspace.p?.path === path || workspace.error);
    assert(!workspace.error, workspace.error);
    await waitFor('editor in project ' + target, () => visibleEditor(path));
    await frame();
    await frame();
    assert(
      editor()
        .text()
        .includes(target === 'fixture' ? marker : 'second projet synthétique'),
      'Editor did not receive the selected project',
    );
    switches.push({ target, ms: now() - switchStart });
  }
  assert(editor().text() === edited, 'Text changed after project switches');

  evidence.phase = 'index';
  const indexing: IndexedBatch[] = [];
  evidence.indexing = indexing;
  await report({ ...evidence, status: 'running' });
  for (let batch = 0; batch < 3; batch++) {
    const notes = await invoke<number>('performance', { action: 'referenceNotes', payload: batch });
    await request('memoryActivity', { active: true });
    let pending = true;
    const indexStart = now();
    const indexed = request('index')
      .then((result) => ({ ...result, ms: now() - indexStart }))
      .finally(() => {
        pending = false;
      });
    const typing = await typeAtDisplayRate(30, () => pending);
    const result = (await indexed) as Awaited<typeof indexed> & {
      indexed: number;
      deferred: boolean;
    };
    assert(
      !result.errors.length && !result.cancelled,
      'Indexing failed: ' + result.errors.join(', '),
    );
    assert(result.indexed === notes, 'Index did not publish the newly added notes');
    assert(typing.nextFrame.length > 0, 'Index finished before any typing overlapped');
    indexing.push({ ...result, ...typing });
    await workspace.doc.flush();
  }
  assert(!workspace.error, workspace.error);
  const cursor = editor().cursor();
  await request('settings', { value: { cursor } });
  evidence.cursor = cursor;
  evidence.status = 'pass';
  await report(evidence);
}
