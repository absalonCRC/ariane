// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { useNoteCreation } from '../src/enrichment/useNoteCreation';
import { defaultSettings } from '../src/contracts/settings';
import { type Source } from '../src/contracts/sources';
import type { Workspace } from '../src/app/useWorkspace';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/platform/client', () => ({ request }));
let create: ReturnType<typeof useNoteCreation>, root: ReturnType<typeof createRoot>;
const source = { id: 'n', kind: 'note', title: 'Claude' } as Source;
function workspace(path = '/a') {
  return {
    p: { path },
    doc: { settings: defaultSettings },
    setSourceVersion: vi.fn(),
    fail: vi.fn(),
  } as unknown as Workspace;
}
function Harness({ w }: { w: Workspace }) {
  create = useNoteCreation(w);
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  root = createRoot(document.createElement('div'));
  request.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
it('returns the note immediately and retries deferred classification without recreating it', async () => {
  const w = workspace();
  request
    .mockResolvedValueOnce(source)
    .mockResolvedValueOnce({ pending: true })
    .mockResolvedValueOnce({ source: { ...source, kind: 'Personne' } });
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => expect(await create('Claude', 'Claude est né ici.')).toBe(source));
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(2400));
  expect(request.mock.calls.map((c) => c[0])).toEqual([
    'createQuickNote',
    'classifyCreatedNote',
    'classifyCreatedNote',
  ]);
  expect(w.setSourceVersion).toHaveBeenCalledTimes(2);
});
it('cancels queued classification when switching projects and honors the off setting', async () => {
  const w = workspace();
  request.mockResolvedValue(source);
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => {
    await create('Claude', '');
  });
  const next = workspace('/b');
  next.doc.settings = { ...defaultSettings, classifyNewNotes: false };
  await act(async () => root.render(<Harness w={next} />));
  await act(async () => {
    await create('Claude', '');
  });
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(request.mock.calls.every((c) => c[0] === 'createQuickNote')).toBe(true);
});
