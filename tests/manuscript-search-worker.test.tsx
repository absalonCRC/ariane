// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Project } from '../src/app/types';
vi.mock('../src/app/client', () => ({ request: vi.fn(async () => []) }));
import { useUnifiedSearch } from '../src/app/useUnifiedSearch';
it('sends only changed sections and rejects obsolete worker responses', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    messages: { id: number; changes: { id: string; text: string }[] }[] = [];
    terminate = vi.fn();
    constructor() {
      FakeWorker.instances.push(this);
    }
    postMessage(value: FakeWorker['messages'][number]) {
      this.messages.push(value);
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  const host = document.createElement('div'),
    root = createRoot(host);
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const project = {
    path: '/fixture',
    sections: [{ id: 's', text: 'été', title: 'Titre', parent: null, position: 0 }],
  } as Project;
  let hook!: ReturnType<typeof useUnifiedSearch>;
  function Harness({ term }: { term: string }) {
    hook = useUnifiedSearch(project, term, 0, subscribe);
    return null;
  }
  try {
    await act(async () => {
      root.render(<Harness term="été" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110);
    });
    const worker = FakeWorker.instances[0],
      first = worker.messages.at(-1)!;
    expect(first.changes[0].text).toBe('été');
    await act(async () => {
      root.render(<Harness term="titre" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110);
    });
    const next = worker.messages.at(-1)!;
    expect(next.changes).toEqual([]);
    await act(async () =>
      worker.onmessage?.({ data: { id: first.id, result: { items: [], total: 99 } } }),
    );
    expect(hook.manuscript.total).toBe(0);
    await act(async () =>
      worker.onmessage?.({ data: { id: next.id, result: { items: [], total: 1 } } }),
    );
    expect(hook.manuscript.total).toBe(1);
    await act(async () => {
      project.sections[0].text = 'nouveau brouillon';
      listeners.forEach((fn) => fn());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110);
    });
    expect(worker.messages.at(-1)!.changes[0].text).toBe('nouveau brouillon');
    expect(FakeWorker.instances).toHaveLength(1);
    await act(async () => root.unmount());
    expect(worker.terminate).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
