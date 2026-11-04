// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMarginPins } from '../src/sources/useMarginPins';
import type { Source } from '../src/app/types';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ request }));
let root: ReturnType<typeof createRoot>, pins: ReturnType<typeof useMarginPins>;
function Harness({ path = '/a', section = 's' }: { path?: string; section?: string }) {
  pins = useMarginPins(path, section);
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement('div'));
  request.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it('keeps explicit pins while loading and rejects stale responses from another text or project', async () => {
  const old = { id: 'old' } as Source,
    next = { id: 'next' } as Source;
  let finish!: (v: Source[]) => void;
  request.mockResolvedValueOnce([old]);
  await act(async () => root.render(<Harness />));
  expect(pins.sources).toEqual([old]);
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    void pins.pin(next);
  });
  request.mockResolvedValueOnce([]);
  await act(async () => root.render(<Harness path="/b" section="other" />));
  await act(async () => finish([old, next]));
  expect(pins.sources).toEqual([]);
});
it('does not let an older initial load overwrite a successful pin', async () => {
  let finish!: (v: Source[]) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<Harness />));
  const added = { id: 'new' } as Source;
  request.mockResolvedValueOnce([added]);
  await act(async () => pins.pin(added));
  await act(async () => finish([]));
  expect(pins.sources).toEqual([added]);
  request.mockResolvedValueOnce([]);
  await act(async () => pins.remove('new'));
  expect(pins.sources).toEqual([]);
});
