// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useUnifiedSearch } from '../src/app/useUnifiedSearch';
import type { Project, Source } from '../src/app/types';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/app/client', () => ({ request }));
it('isolates stale vault responses and leaves manuscript matches usable on vault failure', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const pending: { resolve: (sources: Source[]) => void; reject: (error: Error) => void }[] = [];
  request.mockImplementation(
    () => new Promise<Source[]>((resolve, reject) => pending.push({ resolve, reject })),
  );
  const host = document.createElement('div'),
    root = createRoot(host);
  const p: Project = {
    path: 'one',
    name: 'Livre',
    recovered: false,
    settings: {},
    sections: [
      {
        id: 'a',
        title: 'Texte',
        text: 'La lune et le quai',
        kind: 'scene',
        parent: null,
        position: 0,
        revision: 0,
        synopsis: '',
        status: '',
        goal: 0,
      },
    ],
  };
  let value: ReturnType<typeof useUnifiedSearch>;
  function Harness({ query, project = p }: { query: string; project?: Project }) {
    value = useUnifiedSearch(project, query);
    return null;
  }
  const render = async (query: string, project = p) => {
    await act(async () => root.render(<Harness query={query} project={project} />));
    await act(async () => vi.advanceTimersByTime(230));
  };
  try {
    await render('lune');
    expect(value!.manuscript.total).toBe(1);
    await render('quai');
    await act(async () => pending[0].resolve([{ id: 'old' } as Source]));
    expect(value!.sources).toEqual([]);
    expect(value!.busy).toBe(true);
    await act(async () => pending[1].reject(new Error('Index indisponible')));
    expect(value!.error).toBe('Error: Index indisponible');
    expect(value!.manuscript.total).toBe(1);
    await render('lune');
    await render('lune', { ...p, path: 'two' });
    await act(async () => pending[2].resolve([{ id: 'other-project' } as Source]));
    expect(value!.sources).toEqual([]);
    await act(async () => pending[3].resolve([{ id: 'new' } as Source]));
    expect(value!.sources[0].id).toBe('new');
    await render('');
    expect(value!.sources).toEqual([]);
    expect(value!.busy).toBe(false);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});
