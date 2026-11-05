// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentTitle } from '../src/components/DocumentTitle';
import { ContextMenuProvider } from '../src/components/ContextMenu';
import type { TitleTagInput } from '../src/tags/useTitleTagInput';
const tag = { id: 'h', name: 'histoire', category: '', color: '#54826b' };
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});
async function setup(create = vi.fn(async () => tag)) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const commit = vi.fn(async () => {}),
    assign = vi.fn(async () => {}),
    fail = vi.fn(),
    open = vi.fn();
  let flush: () => Promise<void> = async () => {};
  const options: TitleTagInput = {
    tags: [tag],
    create,
    assign,
    open,
    onError: fail,
    registerFlusher: (fn) => {
      flush = fn;
      return () => {};
    },
  };
  await act(async () =>
    root.render(
      <ContextMenuProvider>
        <DocumentTitle
          title="Le rendez-vous"
          readOnly={false}
          onCommit={commit}
          tagInput={options}
        />
      </ContextMenuProvider>,
    ),
  );
  const input = host.querySelector('input')!;
  const type = async (text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  return { host, input, type, commit, assign, fail, create, open, flush: () => flush() };
}
it('creates a title tag automatically and keeps newer typing while creation completes', async () => {
  let finish!: (value: typeof tag) => void;
  const h = await setup(
    vi.fn(
      () =>
        new Promise<typeof tag>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  await h.type('Le rendez-vous #histoire ');
  await h.type('Le rendez-vous #histoire demain');
  await act(async () => finish(tag));
  expect(h.create).toHaveBeenCalledWith('histoire');
  expect(h.assign).toHaveBeenCalledWith('h');
  expect(h.input.value).toBe('Le rendez-vous demain');
  expect(h.commit).toHaveBeenLastCalledWith('Le rendez-vous demain');
  await act(async () => h.host.querySelector<HTMLButtonElement>('.smart-tag-label')!.click());
  expect(h.open).toHaveBeenCalledWith('h');
});
it('does not assign a token deleted while its definition is being created', async () => {
  let finish!: (value: typeof tag) => void;
  const h = await setup(
    vi.fn(
      () =>
        new Promise<typeof tag>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  await h.type('Le rendez-vous #histoire ');
  await h.type('Le rendez-vous corrigé');
  await act(async () => finish(tag));
  expect(h.assign).not.toHaveBeenCalled();
  expect(h.input.value).toBe('Le rendez-vous corrigé');
});
it('flushes an unfinished title tag for transitions and keeps literal title text on failure', async () => {
  const h = await setup();
  await h.type('Le rendez-vous demain #histoire');
  expect(h.create).not.toHaveBeenCalled();
  await act(async () => h.flush());
  expect(h.input.value).toBe('Le rendez-vous demain ');
  expect(h.commit).toHaveBeenLastCalledWith('Le rendez-vous demain');
  h.create.mockRejectedValueOnce(new Error('Indisponible'));
  await h.type('Le rendez-vous #autre ');
  expect(h.input.value).toBe('Le rendez-vous #autre ');
  expect(h.fail).toHaveBeenCalled();
});
