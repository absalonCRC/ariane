// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ request, native: false }));
import type { Source } from '../src/app/types';
import { useWorkspace } from '../src/app/useWorkspace';

it('keeps suggestions when only paragraph coordinates change and refreshes changed inputs', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  request.mockImplementation(async (command: string) => (command === 'bootstrap' ? null : []));
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      workspace.activate({
        path: 'fixture',
        name: 'Test',
        settings: {},
        sections: [],
        recovered: false,
      }),
    );
    const visible = {
      text: 'Toulouse',
      from: 0,
      allowEnd: false,
      paragraphs: [{ line: 1, text: 'Toulouse', top: 100 }],
    };
    await act(async () => workspace.onVisible(visible));
    await act(async () => vi.advanceTimersByTimeAsync(100));
    const suggestions = () => request.mock.calls.filter(([command]) => command === 'suggest');
    expect(suggestions()).toHaveLength(1);
    await act(async () =>
      workspace.setSources([
        { id: 'toulouse', title: 'Toulouse', matched: 'toulouse', score: 100 } as Source,
      ]),
    );
    expect(workspace.groups[0].top).toBe(100);
    await act(async () =>
      workspace.onVisible({ ...visible, paragraphs: [{ ...visible.paragraphs[0], top: 90 }] }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(suggestions()).toHaveLength(1);
    expect(workspace.groups[0].top).toBe(90);
    await act(async () =>
      workspace.onVisible({ ...visible, paragraphs: [{ ...visible.paragraphs[0], top: -50 }] }),
    );
    expect(workspace.groups[0].top).toBe(-50); // No viewport clamping: the label leaves with its passage.
    await act(async () =>
      workspace.onVisible({
        ...visible,
        paragraphs: [{ line: 2, text: 'Autre passage', top: 100 }],
      }),
    );
    expect(workspace.groups).toHaveLength(0); // Never reattach Toulouse to unrelated text.
    await act(async () => workspace.onVisible({ ...visible, allowEnd: true }));
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(suggestions()).toHaveLength(2);
    await act(async () => workspace.onVisible({ ...visible, text: 'Lyon' }));
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(suggestions()).toHaveLength(3);
    await act(async () => workspace.setSourceVersion((v) => v + 1));
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(suggestions()).toHaveLength(4);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});
