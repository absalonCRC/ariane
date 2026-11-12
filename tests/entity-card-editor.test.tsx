// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { EntityManager } from '../src/entities/EntityManager';
import type { EntityManagerController } from '../src/entities/useEntityManager';
import type { Source } from '../src/contracts/sources';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/platform/client', () => ({ native: false, request: mocks.request }));
it('loads the full source before editing instead of saving the truncated list preview', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const full = 'Un texte complet. '.repeat(100);
  const source: Source = {
    id: 'source',
    vaultId: 'owned',
    path: 'Notes/fiche.md',
    title: 'Fiche',
    kind: 'Note',
    aliases: [],
    tags: [],
    fields: {},
    text: full.slice(0, 240),
    page: null,
    matched: null,
    score: 0,
    fingerprint: 'full-hash',
  };
  const entity = {
    id: 'entity',
    title: 'Fiche',
    kind: 'Note',
    aliases: [],
    sourceIds: ['source'],
    detectedIds: [],
    confirmed: true,
  };
  const manager = {
    catalog: { revision: 1, entities: [entity], relations: [] },
    sources: [source],
    batches: [],
    detections: [],
    owned: ['owned'],
    merges: [],
    views: [],
    busy: false,
    error: '',
    run: async (fn: () => Promise<unknown>) => fn(),
    apply: vi.fn(),
  } as unknown as EntityManagerController;
  mocks.request.mockResolvedValue({ ...source, text: full });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EntityManager
        project={{
          path: 'synthetic',
          name: 'Synthetic',
          sections: [],
          settings: {},
          recovered: false,
        }}
        manager={manager}
        batches={[]}
        onClose={() => {}}
        onError={() => {}}
        onPassage={() => {}}
        onSource={() => {}}
        onChanged={() => {}}
      />,
    ),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('aside button[aria-current]')?.click(),
  );
  const choose = [...host.querySelectorAll('aside button')].find((b) =>
    b.textContent?.includes('FicheNote'),
  ) as HTMLButtonElement | undefined;
  const actual =
    choose ??
    ([...host.querySelectorAll('aside button')].find((b) =>
      b.textContent?.includes('Confirmée'),
    ) as HTMLButtonElement);
  await act(async () => actual.click());
  const edit = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === 'Modifier la fiche',
  )!;
  await act(async () => edit.click());
  expect(mocks.request).toHaveBeenCalledWith('source', { id: 'source' });
  expect(host.querySelector('textarea')?.value).toBe(full);
  await act(async () => root.unmount());
  host.remove();
});
