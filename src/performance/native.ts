import { invoke } from '@tauri-apps/api/core';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import type { Workspace } from '../app/useWorkspace';
import type { Project, Source } from '../app/types';
import { request } from '../app/client';
import type { MemoryController, MemoryEntity, MemoryResult } from '../enrichment/useMemory';
let current: Workspace;
let memory: MemoryController;
let partialReport: Record<string, unknown> = {};
let started = false;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
async function until(test: () => boolean, timeout = 60000) {
  const start = performance.now();
  while (!test()) {
    if (performance.now() - start > timeout) throw new Error('Native benchmark timeout');
    await delay(30);
  }
}
function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: samples.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted.at(-1),
  };
}
export function attach(workspace: Workspace, controller: MemoryController) {
  current = workspace;
  memory = controller;
  if (started || !workspace.ready) return;
  started = true;
  void run().catch(async (error) => {
    await invoke('performance', {
      action: 'report',
      payload: { ...partialReport, error: String(error), stack: error?.stack },
    });
  });
}
async function run() {
  const resumed = sessionStorage.getItem('ariane-memory-benchmark');
  if (resumed) {
    sessionStorage.removeItem('ariane-memory-benchmark');
    const { path, report } = JSON.parse(resumed);
    partialReport = report;
    // Bootstrap already reopened the saved project; mounting it twice would
    // overwrite the very cursor restoration this scenario is measuring.
    if (current.p?.path !== path) current.activate(await request<Project>('open', { path }));
    await until(() => memory.resume?.node === '0-0' && !!document.querySelector('.cm-editor'));
    await until(() => current.editor.current?.context()?.offset === 24, 5000);
    report.restoredPosition = current.editor.current!.context();
    if ((report.restoredPosition as { offset: number } | null)?.offset !== 24)
      throw new Error('Resume offset was not restored');
    report.resumeLinkVisible = !!document.querySelector('.memory-resume');
    report.maxContextLabels = document.querySelectorAll('.memory-context').length;
    report.errors = current.error;
    current.doc.configure({ enrichment: false });
    await request('memoryActivity', { active: true });
    await invoke('performance', { action: 'report', payload: report });
    document.title = 'Ariane — mémoire native vérifiée';
    return;
  }
  const fixture = await invoke<{ path: string; memoryTest: boolean; entitiesTest: boolean }>(
    'performance',
    {
      action: 'prepare',
    },
  );
  const report: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
    fixture,
    scriptedInput: true,
  };
  partialReport = report;
  const loadStart = performance.now();
  const project = await request<Project>('open', { path: fixture.path });
  report.openIPC = performance.now() - loadStart;
  const renderStart = performance.now();
  current.activate(project);
  await until(() => !!document.querySelector('.cm-editor'));
  await frame();
  await frame();
  report.editorMountMs = performance.now() - renderStart;
  if (fixture.memoryTest) {
    await runMemory(fixture.path, report);
    return;
  }
  await until(() => current.sourceStatus === 'ready');
  report.initialSources = current.sources.length;
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
  current.editor.current!.focus();
  const input: number[] = [],
    frames: number[] = [],
    saves: number[] = [],
    suggestions: number[] = [];
  // Several bursts allow actual autosave and contextual requests to execute between typing.
  for (let burst = 0; burst < 4; burst++) {
    for (let i = 0; i < 30; i++) {
      await frame();
      const start = performance.now();
      current.editor.current!.insert('a');
      input.push(performance.now() - start);
      await frame();
      frames.push(performance.now() - start);
    }
    await until(() => current.doc.status === 'saved' && current.sourceStatus === 'ready');
    const start = performance.now();
    await current.doc.flush();
    saves.push(performance.now() - start);
  }
  report.inputMs = stats(input);
  report.nextFrameMs = stats(frames);
  const start = performance.now();
  current.editor.current!.insert('FINAL');
  await current.doc.flush();
  report.flushAfterImmediateEditMs = performance.now() - start;
  const beforeUndo = current.editor.current!.text();
  undo(view);
  redo(view);
  report.undoRedo = beforeUndo === current.editor.current!.text();
  await current.doc.flush();
  const persisted = await request<Project>('open', { path: fixture.path });
  report.savedText =
    persisted.sections.find((s) => s.id === 'scene-0')!.text ===
    current.doc.ref.current!.sections.find((s) => s.id === 'scene-0')!.text;
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    const found = await request<Source[]>('suggest', {
      text: 'La mémoire de Toulouse.',
      depth: 0,
      allowEnd: true,
    });
    if (!found.some((s) => s.title === 'Toulouse')) throw new Error('Expected source missing');
    suggestions.push(performance.now() - start);
  }
  report.suggestMs = stats(suggestions);
  const searches: number[] = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    await request('search', { query: 'mémoire des lieux dans la ville' });
    searches.push(performance.now() - start);
  }
  report.searchColdMs = searches[0];
  report.searchWarmMs = stats(searches.slice(1));
  const binderStart = performance.now();
  current.setBinder(true);
  await until(() => !!document.querySelector('.binder .tree-row'));
  await frame();
  await frame();
  report.binderOpenMs = performance.now() - binderStart;
  report.binderDOMRows = document.querySelectorAll('.binder .tree-row').length;
  const manuscriptStart = performance.now();
  let paintedFrames = 0,
    watching = true;
  const watch = () => {
    if (watching) {
      paintedFrames++;
      requestAnimationFrame(watch);
    }
  };
  requestAnimationFrame(watch);
  current.setSearch('mémoire');
  await until(() => current.unifiedSearch.manuscript.total > 0 && !current.unifiedSearch.busy);
  watching = false;
  report.manuscriptSearch = {
    ms: performance.now() - manuscriptStart,
    paintedFrames,
    total: current.unifiedSearch.manuscript.total,
    visible: current.unifiedSearch.manuscript.items.length,
  };
  if (paintedFrames < 2 || current.unifiedSearch.manuscript.items.length > 200)
    throw new Error('Manuscript worker responsiveness failed');
  current.setSearch(null);
  report.documentCharacters = current.editor.current!.text().length;
  report.sourceStatus = current.sourceStatus;
  report.errors = current.error;
  // Geometry assertions run after timings so resizing does not skew the benchmark.
  const margins = [];
  for (const width of [1440, 1000, 760]) {
    await invoke('performance', { action: 'resize', payload: { width } });
    for (const binder of [false, true]) {
      current.setBinder(binder);
      await delay(1100);
      const label = document.querySelector<HTMLElement>('.source-label');
      const manuscript = document
        .querySelector<HTMLElement>('.manuscript-column')!
        .getBoundingClientRect();
      const rect = label?.getBoundingClientRect();
      margins.push({
        width,
        binder,
        gap: rect ? rect.left - manuscript.right : null,
        insideWindow: !!rect && rect.right <= innerWidth,
        noOverlap: !!rect && rect.left >= manuscript.right + 20,
      });
    }
  }
  await invoke('performance', { action: 'resize', payload: { width: 1440 } });
  current.setBinder(false);
  await delay(1100);
  const group = document.querySelector<HTMLElement>('.source-group')!;
  const anchorLine = group?.dataset.anchorLine;
  const beforeTop = group?.getBoundingClientRect().top;
  const beforeScroll = view.scrollDOM.scrollTop;
  view.scrollDOM.scrollTop += 40;
  await frame();
  await frame();
  await frame();
  const moved = document.querySelector<HTMLElement>(
    `.source-group[data-anchor-line="${anchorLine}"]`,
  );
  const scrollDelta = view.scrollDOM.scrollTop - beforeScroll;
  const labelDelta =
    moved && beforeTop !== undefined ? moved.getBoundingClientRect().top - beforeTop : null;
  report.marginLayout = margins;
  report.marginScroll = {
    scrollDelta,
    labelDelta,
    followsPassage:
      labelDelta !== null && scrollDelta > 0 && Math.abs(labelDelta + scrollDelta) < 2,
  };
  view.scrollDOM.scrollTop = beforeScroll;
  await invoke('performance', { action: 'report', payload: report });
  document.title = 'Ariane — mesure native terminée';
}

async function runMemory(path: string, report: Record<string, unknown>) {
  const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
  view.dispatch({ selection: { anchor: view.state.doc.line(1).to - 1 } });
  current.editor.current!.focus();
  async function burst() {
    const dispatch: number[] = [],
      nextFrame: number[] = [];
    for (let i = 0; i < 90; i++) {
      await frame();
      const start = performance.now();
      current.editor.current!.insert(' ');
      dispatch.push(performance.now() - start);
      await frame();
      nextFrame.push(performance.now() - start);
    }
    const start = performance.now();
    await current.doc.flush();
    return {
      dispatchMs: stats(dispatch),
      nextFrameMs: stats(nextFrame),
      flushMs: performance.now() - start,
    };
  }
  const suggestionTimes = async () => {
    const times: number[] = [];
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      await request('suggest', {
        text: `Louise Morel retrouve son atelier à Arles. Carnet ${i}.`,
        depth: 3,
        allowEnd: true,
      });
      times.push(performance.now() - start);
      await delay(120);
    }
    return stats(times);
  };
  report.suggestionsWithoutEntities = await suggestionTimes();
  report.disabled = await burst();
  current.doc.configure({ enrichment: true, depth: 3 });
  await delay(100);
  await until(() => current.doc.status === 'saved');
  const coldStart = performance.now();
  // Time automatic detection first, independently of the shared model startup.
  await until(() => !!memory.result?.entities.length && !!memory.result.evidence, 15000);
  report.fastDetectionAfterSaveMs = performance.now() - coldStart;
  report.fastDetection = memory.result;
  let state = { pid: 0, blocked: false };
  while (!state.pid) {
    if (performance.now() - coldStart > 60000) throw new Error('Shared Gemma did not start');
    await delay(100);
    state = await invoke('performance', { action: 'memoryState' });
  }
  report.workerStartAfterMs = performance.now() - coldStart;
  if (report.fixture && (report.fixture as { entitiesTest?: boolean }).entitiesTest) {
    const nerStart = performance.now();
    let nerState = { nerPid: 0 };
    while (!nerState.nerPid) {
      if (performance.now() - nerStart > 20000)
        throw new Error('GLiNER did not start automatically');
      await delay(100);
      nerState = await invoke('performance', { action: 'memoryState' });
    }
    report.nerWorker = nerState;
  }
  report.enabledCold = await burst();
  report.activityDuringTyping = await invoke('performance', { action: 'memoryState' });
  await until(() => !!memory.result && !memory.result.busy, 90000);
  report.firstContextAfterMs = performance.now() - coldStart;
  report.modelError = memory.result?.modelError;
  if (memory.result?.modelError) throw new Error(memory.result.modelError);
  report.enabledWarm = await burst();
  const warmDetection = performance.now();
  await until(() => !!memory.result && !memory.result.busy, 90000);
  report.warmDetectionAfterSaveMs = performance.now() - warmDetection;
  report.suggestionsWithEntities = await suggestionTimes();
  if (report.fixture && (report.fixture as { entitiesTest?: boolean }).entitiesTest) {
    const wait = performance.now();
    let detected: MemoryEntity[] = [];
    do {
      // Poll the read-only context, not memoryList (which synchronizes the
      // manuscript). Observation must not become a second indexer.
      const context = await request<MemoryResult>('memoryContext', {
        projectPath: path,
        section: 'scene-5',
        node: '5-0',
        depth: 0,
      });
      detected = context.entities;
      if (detected.some((e) => e.title === 'Institut Pasteur')) break;
      if (memory.error) throw new Error(memory.error);
      if (performance.now() - wait > 90000)
        throw new Error('Automatic GLiNER organization missing');
      await delay(500);
    } while (true);
    for (const [title, kind] of [
      ['Marie Curie', 'person'],
      ['Paris', 'place'],
      ['Institut Pasteur', 'organization'],
    ]) {
      if (!detected.some((e) => e.title === title && e.kind === kind))
        throw new Error(`GLiNER missed ${title}`);
    }
    report.automaticEntities = detected;
    report.entitiesReadyAfterMs = performance.now() - coldStart;
  }
  // Finish the six semantic fixtures through the ordinary production IPC.
  const queueResults = [];
  for (let i = 0; i < 6; i++) {
    await request('memoryActivity', { active: false });
    const section = current.doc.ref.current!.sections.find((s) => s.id === `scene-${i}`)!;
    let result: MemoryResult;
    do {
      result = await request('memoryQueue', {
        projectPath: path,
        section: section.id,
        node: `${i}-0`,
        revision: section.revision,
        depth: 3,
        semantic: true,
      });
      if (result.busy) await delay(200);
    } while (result.busy);
    if (result.modelError) throw new Error(result.modelError);
    queueResults.push(result);
  }
  const entities = await request<MemoryEntity[]>('memoryList', { projectPath: path });
  const louise = entities.find((e) => e.title === 'Louise Morel');
  if (!louise) throw new Error('Derived Louise fiche missing');
  const fiche = await request<{ fields: unknown[]; timeline: { date: string }[] }>('memoryEntity', {
    projectPath: path,
    id: louise.id,
  });
  if (
    !fiche.timeline.some((d) => d.date === '1921') ||
    !fiche.timeline.some((d) => d.date === '1924')
  )
    throw new Error('Dated events missing');
  const recall = await request<MemoryResult>('memoryContext', {
    projectPath: path,
    section: 'scene-1',
    node: '1-0',
    depth: 3,
  });
  if (recall.recall?.section !== 'scene-0')
    throw new Error('Semantic recall missed the house passage');
  const unrelated = [];
  for (const i of [3, 4]) {
    const context = await request<MemoryResult>('memoryContext', {
      projectPath: path,
      section: `scene-${i}`,
      node: `${i}-0`,
      depth: 3,
    });
    if (context.recall) throw new Error(`Unrelated passage recalled for scene ${i}`);
    unrelated.push(i);
  }
  report.unrelatedPassagesWithoutRecall = unrelated;
  const evidence = queueResults[0].evidence;
  if (!evidence?.quote.includes('reliure')) throw new Error('Source excerpt missing');
  report.features = { entities, fiche, recall: recall.recall, evidence };
  const semanticDetection = performance.now();
  await current.locatePassage(
    'scene-1',
    '1-0',
    'La demeure abandonnée semblait attendre ses habitants.',
  );
  await until(
    () => memory.anchor?.section === 'scene-1' && memory.result?.recall?.section === 'scene-0',
    15000,
  );
  report.warmSemanticDetectionMs = performance.now() - semanticDetection;
  await until(() => !!document.querySelector('.memory-context'), 5000);
  report.semanticMarginVisible = document
    .querySelector('.memory-context')
    ?.textContent?.includes('Dans votre manuscrit');
  await current.locatePassage('scene-0', '0-0', 'Louise Morel');
  memory.open({ kind: 'entity', id: louise.id });
  await until(() => !!document.querySelector('.memory-date'));
  report.ficheVisible = document.querySelector('.memory-reader')?.textContent?.includes('1924');
  report.noCitationOnDerivedFiche = !document
    .querySelector('.memory-reader')
    ?.textContent?.includes('Citer');
  memory.close();
  // Navigation remounts CodeMirror when leaving continuous mode. Use the live
  // editor instead of the pre-navigation view retained by the typing benchmark.
  const resumeView = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
  resumeView.dispatch({ selection: { anchor: 24 } });
  await until(() => current.editor.current?.context()?.offset === 24, 5000);
  const source = await request<Source>('memorySource', {
    id: evidence.sourceId,
    fingerprint: evidence.fingerprint,
  });
  current.setReader({ ...source, page: evidence.page, selectedExcerpt: evidence.quote });
  await until(() => !!document.querySelector('.memory-source-excerpt'));
  report.sourceExcerptVisible =
    document.querySelector('.memory-source-excerpt')?.textContent === evidence.quote;
  await delay(100);
  current.setReader(null);
  await until(() => !document.querySelector('.memory-source-excerpt'));
  // The source reader can return focus to a remounted editor. Establish the
  // final author position after closing it, then verify the persisted receipt.
  const finalView = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!;
  finalView.dispatch({ selection: { anchor: 24 } });
  await until(() => current.editor.current?.context()?.offset === 24, 5000);
  await current.memorySessionSaver.current();
  const savedSession = await request<{ offset: number }>('memorySession', { projectPath: path });
  report.savedSession = savedSession;
  if (savedSession.offset !== 24) throw new Error('Session was not saved at offset 24');
  const persisted = await request<Project>('open', { path });
  report.persistedText =
    persisted.sections.find((s) => s.id === 'scene-0')!.text ===
    current.doc.ref.current!.sections.find((s) => s.id === 'scene-0')!.text;
  sessionStorage.setItem('ariane-memory-benchmark', JSON.stringify({ path, report }));
  location.reload();
}
