// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMemory, type MemoryController } from '../src/enrichment/useMemory';
import type { Workspace } from '../src/app/useWorkspace';
import type { Section } from '../src/contracts/project';
import { MemoryReader } from '../src/enrichment/MemoryReader';
import { HistoryEdge } from '../src/app/chrome/HistoryEdge';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/platform/client', () => ({ native: true, request }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let memory: MemoryController;
const position = { section: 's', node: 'n', offset: 0, cursor: 0 };
function workspace(path = 'a') {
  const p = {
    path,
    sections: [
      {
        id: 's',
        revision: 1,
        title: 'Scène',
        text: 'Un passage.',
        outline: { version: 1, nodes: [{ id: 'n', parent: null, start: 0 }] },
      },
    ],
  };
  return {
    p,
    active: 's',
    doc: {
      project: p,
      ref: { current: p },
      generation: 1,
      status: 'saved',
      settings: { enrichment: true, depth: 3, focus: 'none' },
    },
    editor: {
      current: {
        context: () => position,
        contextTop: () => 100,
        restoreContext: vi.fn(() => true),
      },
    },
    memorySessionSaver: { current: async () => {} },
    setCard: vi.fn(),
    setReader: vi.fn(),
    setSearch: vi.fn(),
    locatePassage: vi.fn(),
    viewport: { text: 'Un passage.', cursor: 0 },
  } as unknown as Workspace;
}
function Harness({ w }: { w: Workspace }) {
  memory = useMemory(w);
  return <span>{memory.result?.recall?.quote}</span>;
}
beforeEach(() => {
  vi.useFakeTimers();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  request.mockReset();
  request.mockImplementation((type: string) =>
    Promise.resolve(
      type === 'memorySession'
        ? { ...position, recent: [] }
        : type === 'memoryQueue'
          ? {
              entities: [],
              anchorHash: 'h',
              recall: {
                id: 'r',
                section: 'old',
                node: 'o',
                title: 'Ancien',
                quote: 'Souvenir',
                hash: 'x',
              },
            }
          : true,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
it('keeps history folded by default, toggles it from the edge, and restores focus after Escape', async () => {
  const w = workspace();
  function HistoryHarness() {
    memory = useMemory(w);
    return (
      <>
        <HistoryEdge
          open={memory.view?.kind === 'resume'}
          onToggle={() =>
            memory.view?.kind === 'resume' ? memory.close() : memory.open({ kind: 'resume' })
          }
        />
        <MemoryReader memory={memory} workspace={w} />
      </>
    );
  }
  await act(async () => root.render(<HistoryHarness />));
  const edge = host.querySelector<HTMLButtonElement>('.history-edge-trigger')!;
  expect(host.querySelector('#project-activity-history')).toBeNull();
  await act(async () => {
    edge.focus();
    edge.click();
  });
  expect(edge.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('#project-activity-history')?.getAttribute('aria-label')).toBe(
    'Historique',
  );
  await act(async () => edge.click());
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(host.querySelector('#project-activity-history')).toBeNull();
  await act(async () => {
    edge.focus();
    edge.click();
  });
  const panel = host.querySelector('#project-activity-history')!;
  await act(async () =>
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(edge.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('#project-activity-history')).toBeNull();
  expect(document.activeElement).toBe(edge);
});
it('only runs inference after a saved idle window, and suspends on typing', async () => {
  let w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(request.mock.calls.some((c) => c[0] === 'memoryQueue')).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(host.textContent).toBe('Souvenir');
  await act(async () => {
    w.doc.ref.current!.sections[0].text += ' modifié';
    memory.onTyping();
    w = { ...w, doc: { ...w.doc, status: 'editing' } };
    root.render(<Harness w={w} />);
  });
  expect(host.textContent).toBe('');
  expect(request).toHaveBeenCalledWith('memoryActivity', { active: true });
  const count = request.mock.calls.filter((c) => c[0] === 'memoryQueue').length;
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(request.mock.calls.filter((c) => c[0] === 'memoryQueue')).toHaveLength(count);
});
it('discards a result that arrives after switching projects', async () => {
  let finish: (v: unknown) => void = () => {};
  request.mockImplementation((type: string) =>
    type === 'memoryQueue'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(type === 'memorySession' ? { ...position, recent: [] } : true),
  );
  await act(async () => root.render(<Harness w={workspace('a')} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  await act(async () => root.render(<Harness w={workspace('b')} />));
  await act(async () =>
    finish({ entities: [], recall: { quote: 'Wrong project' }, anchorHash: 'x' }),
  );
  expect(host.textContent).toBe('');
});
it('retains cached results for unchanged nodes while another node is edited and saved', async () => {
  const w = workspace();
  const text = 'Premier passage.\nDeuxième passage.\nDernier passage.';
  const section = w.doc.ref.current!.sections[0];
  section.text = text;
  section.outline = {
    version: 1,
    nodes: [
      { id: 'a', parent: null, start: 0 },
      { id: 'b', parent: null, start: text.indexOf('Deuxième') },
      { id: 'c', parent: null, start: text.indexOf('Dernier') },
    ],
  };
  let context = { ...position, node: 'a' };
  w.editor.current!.context = () => context;
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  context = { ...context, node: 'c', cursor: 40 };
  await act(async () =>
    root.render(<Harness w={{ ...w, viewport: { ...w.viewport!, cursor: 40 } }} />),
  );
  await act(async () => vi.advanceTimersByTimeAsync(600));
  const count = request.mock.calls.filter(([type]) => type === 'memoryQueue').length;
  section.text = text.replace('Deuxième', 'Un autre deuxième');
  section.outline.nodes[2].start = section.text.indexOf('Dernier');
  await act(async () => {
    memory.onTyping();
    root.render(<Harness w={{ ...w, doc: { ...w.doc, status: 'editing' } }} />);
  });
  expect(host.textContent).toBe('Souvenir');
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(request.mock.calls.filter(([type]) => type === 'memoryQueue')).toHaveLength(count);
  context = { ...context, node: 'a', cursor: 0 };
  await act(async () =>
    root.render(<Harness w={{ ...w, viewport: { ...w.viewport!, cursor: 0 } }} />),
  );
  expect(host.textContent).toBe('Souvenir');
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(request.mock.calls.filter(([type]) => type === 'memoryQueue')).toHaveLength(count);
});
it('does not run inference while dictation is active', async () => {
  await act(async () => root.render(<Harness w={workspace()} />));
  await act(async () => memory.setRecording(true));
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(request.mock.calls.some((c) => c[0] === 'memoryQueue')).toBe(false);
});
it('waits for the lazy editor before restoring and saving the session position', async () => {
  let w = workspace();
  const restore = vi.fn(() => false);
  w.editor.current!.restoreContext = restore;
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(request.mock.calls.filter((c) => c[0] === 'memorySession' && c[1].value)).toHaveLength(0);
  restore.mockReturnValue(true);
  w = { ...w, viewport: { ...w.viewport!, cursor: 24 } };
  await act(async () => root.render(<Harness w={w} />));
  expect(restore).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(request.mock.calls.some((c) => c[0] === 'memorySession' && c[1].value)).toBe(true);
});
it('opens derived evidence without citation actions or a fabricated source', async () => {
  const w = workspace();
  const model = {
    view: { kind: 'entity', id: 'e' },
    close: vi.fn(),
    open: vi.fn(),
  } as unknown as MemoryController;
  request.mockResolvedValue({
    id: 'e',
    title: 'Louise Morel',
    kind: 'person',
    fields: [],
    timeline: [
      { date: '1924', text: 'Louise arrive.', section: 's', node: 'n', quote: 'Louise arrive.' },
    ],
    passages: [],
  });
  await act(async () => root.render(<MemoryReader memory={model} workspace={w} />));
  expect(host.textContent).toContain('1924');
  expect(host.textContent).not.toContain('Citer');
  await act(async () => host.querySelector<HTMLButtonElement>('.memory-date')!.click());
  expect(w.locatePassage).toHaveBeenCalledWith('s', 'n', 'Louise arrive.');
});

it('resumes with the exact passage, previous passage, and fetched source title', async () => {
  const w = workspace();
  const passage = 'La porte était close.\n\nÉlise attendait.';
  w.p!.sections = [
    {
      id: 's',
      title: 'Scène',
      text: passage,
      outline: {
        version: 1,
        nodes: [
          { id: 'a', parent: null, start: 0 },
          { id: 'n', parent: null, start: passage.indexOf('Élise') },
        ],
      },
    },
    { id: 'old', title: 'Avant', text: 'Le voyage avait commencé.' },
  ] as Section[];
  const model = {
    view: { kind: 'resume' },
    close: vi.fn(),
    resume: {
      section: 's',
      node: 'n',
      offset: 0,
      cursor: 23,
      sourceId: 'source-1',
      sourcePage: 2,
      recent: [
        { section: 's', node: 'n' },
        { section: 'old', node: null },
      ],
    },
  } as unknown as MemoryController;
  request.mockImplementation((type: string) =>
    Promise.resolve(
      type === 'memorySource' ? { id: 'source-1', title: 'Carnet de terrain' } : true,
    ),
  );
  await act(async () => root.render(<MemoryReader memory={model} workspace={w} />));
  expect(host.textContent).toContain('Élise attendait.');
  expect(host.textContent).toContain('Carnet de terrain');
  expect(host.textContent).toContain('Le voyage avait commencé.');
  await act(async () => host.querySelector<HTMLButtonElement>('.resume-primary')!.click());
  expect(w.locatePassage).toHaveBeenCalledWith(
    's',
    'n',
    '',
    expect.objectContaining({ ...position, cursor: 23 }),
  );
});

it('does not show a source title returned for a former project', async () => {
  const finish: ((value: unknown) => void)[] = [];
  request.mockImplementation((type: string) =>
    type === 'memorySource'
      ? new Promise((resolve) => finish.push(resolve))
      : Promise.resolve(true),
  );
  const model = {
    view: { kind: 'resume' },
    close: vi.fn(),
    resume: { ...position, sourceId: 'source-1', recent: [] },
  } as unknown as MemoryController;
  await act(async () => root.render(<MemoryReader memory={model} workspace={workspace('a')} />));
  await act(async () => root.render(<MemoryReader memory={model} workspace={workspace('b')} />));
  await act(async () => finish[0]({ id: 'source-1', title: 'Ancien projet' }));
  expect(host.textContent).not.toContain('Ancien projet');
  await act(async () => finish[1]({ id: 'source-1', title: 'Projet actuel' }));
  expect(host.textContent).toContain('Projet actuel');
});

it('publishes fast detections before requesting the shared semantic model', async () => {
  request.mockImplementation((type: string) =>
    Promise.resolve(
      type === 'memoryQueue'
        ? {
            entities: [{ id: 'e', title: 'Louise Morel', kind: 'person' }],
            anchorHash: 'h',
            recall: null,
            pending: true,
          }
        : type === 'memorySession'
          ? { ...position, recent: [] }
          : true,
    ),
  );
  await act(async () => root.render(<Harness w={workspace()} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(memory.result?.entities[0].title).toBe('Louise Morel');
  expect(
    request.mock.calls.filter((c) => c[0] === 'memoryQueue').map((c) => c[1].semantic),
  ).toEqual([false]);
  await act(async () => vi.advanceTimersByTimeAsync(1200));
  expect(
    request.mock.calls.filter((c) => c[0] === 'memoryQueue').map((c) => c[1].semantic),
  ).toEqual([false, true]);
});
it('keeps facts and sources visible during pressure and retries instead of waiting a minute', async () => {
  request.mockImplementation((type: string) =>
    Promise.resolve(
      type === 'memoryQueue'
        ? {
            entities: [],
            anchorHash: 'h',
            recall: { quote: 'Souvenir' },
            pending: true,
            deferred: true,
          }
        : type === 'memorySession'
          ? { ...position, recent: [] }
          : true,
    ),
  );
  await act(async () => root.render(<Harness w={workspace()} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(host.textContent).toBe('Souvenir');
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(request.mock.calls.filter((c) => c[0] === 'memoryQueue')).toHaveLength(2);
});
it('keeps contextual results when the cursor moves within the same logical block', async () => {
  const w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(host.textContent).toBe('Souvenir');
  await act(async () =>
    root.render(<Harness w={{ ...w, viewport: { ...w.viewport!, cursor: 48 } }} />),
  );
  expect(host.textContent).toBe('Souvenir');
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(request.mock.calls.filter(([type]) => type === 'memoryQueue')).toHaveLength(1);
});

it('keeps suggestions live while GLiNER is slow and merges entities without replacing recall', async () => {
  const base = request.getMockImplementation()!;
  let finish: (v: unknown) => void = () => {};
  request.mockImplementation((type: string, ...args: unknown[]) =>
    type === 'memoryEntities'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(type, ...args),
  );
  await act(async () => root.render(<Harness w={workspace()} />));
  await act(async () => vi.advanceTimersByTimeAsync(1200));
  expect(request.mock.calls.some((c) => c[0] === 'memoryEntities')).toBe(true);
  expect(host.textContent).toBe('Souvenir');
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(host.textContent).toBe('Souvenir');
  await act(async () =>
    finish({ anchorHash: 'h', entities: [{ id: 'org', title: 'UNESCO', kind: 'organization' }] }),
  );
  expect(memory.result?.entities[0].title).toBe('UNESCO');
  expect(host.textContent).toBe('Souvenir');
});

it('discards GLiNER results after typing or changing project and suppresses it during dictation', async () => {
  const base = request.getMockImplementation()!;
  let finish: (v: unknown) => void = () => {};
  request.mockImplementation((type: string, ...args: unknown[]) =>
    type === 'memoryEntities'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(type, ...args),
  );
  await act(async () => root.render(<Harness w={workspace('a')} />));
  await act(async () => vi.advanceTimersByTimeAsync(1200));
  await act(async () => {
    memory.onTyping();
    root.render(<Harness w={workspace('b')} />);
  });
  await act(async () => vi.advanceTimersByTimeAsync(600));
  await act(async () =>
    finish({ anchorHash: 'h', entities: [{ id: 'bad', title: 'Wrong project', kind: 'person' }] }),
  );
  expect(memory.result?.entities).toEqual([]);
  const count = request.mock.calls.filter((c) => c[0] === 'memoryEntities').length;
  await act(async () => memory.setRecording(true));
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(request.mock.calls.filter((c) => c[0] === 'memoryEntities')).toHaveLength(count);
});
