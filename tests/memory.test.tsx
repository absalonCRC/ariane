// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMemory, type MemoryController } from '../src/enrichment/useMemory';
import type { Workspace } from '../src/app/useWorkspace';
import { MemoryReader } from '../src/enrichment/MemoryReader';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/app/client', () => ({ native: true, request }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let memory: MemoryController;
const position = { section: 's', node: 'n', offset: 0, cursor: 0 };
function workspace(path = 'a') {
  const p = { path, sections: [{ id: 's', revision: 1, title: 'Scène' }] };
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
it('only runs inference after a saved idle window, and suspends on typing', async () => {
  let w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(request.mock.calls.some((c) => c[0] === 'memoryQueue')).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(host.textContent).toBe('Souvenir');
  await act(async () => {
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
it('removes an old contextual label immediately when the cursor changes', async () => {
  const w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(host.textContent).toBe('Souvenir');
  await act(async () =>
    root.render(<Harness w={{ ...w, viewport: { ...w.viewport!, cursor: 48 } }} />),
  );
  expect(host.textContent).toBe('');
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
