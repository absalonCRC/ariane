// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Inbox } from '../src/capture/Inbox';
import type { InboxCapture } from '../src/contracts/inbox';
import type { Project } from '../src/contracts/project';
const runtime = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/platform/client', () => ({ native: true, request: runtime.request }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('../src/capture/CapturePreferences', () => ({ CapturePreferences: () => null }));
vi.mock('../src/app/commands/ShortcutSettings', () => ({ ShortcutSettings: () => null }));

it('retries a lost filing response with the same identity and proposes navigation without closing the inbox', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const show = HTMLDialogElement.prototype.showModal,
    close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const capture: InboxCapture = {
    id: 'capture',
    revision: 2,
    text: 'Été 🌿\nUne idée',
    createdAt: '2026-11-13T12:00:00Z',
    updatedAt: '2026-11-13T12:00:00Z',
    status: 'ready',
    selection: { anchor: 0, head: 0 },
    destination: null,
  };
  const project: Project = {
    path: '/synthetique',
    name: 'SYNTHÉTIQUE',
    sections: [],
    settings: {},
    recovered: false,
  };
  let filed: InboxCapture | null = null,
    attempts = 0;
  runtime.request.mockImplementation(async (type, args) => {
    if (type === 'projects') return [];
    if (type === 'inboxList')
      return { items: args.filed ? (filed ? [filed] : []) : filed ? [] : [capture], more: false };
    if (type === 'inboxTarget') return { projectId: 'project-id', branchId: 'main' };
    if (type === 'inboxTransfer') {
      filed = {
        ...capture,
        status: 'filed',
        revision: 3,
        destination: { ...args.operation, sectionId: 'imported', fingerprint: 'hash' },
      };
      if (!attempts++) throw Error('réponse perdue');
      return filed;
    }
    throw Error(type);
  });
  const failed = vi.fn(),
    imported = vi.fn(async () => {}),
    transferred = vi.fn(async () => {}),
    closed = vi.fn();
  function Harness() {
    const [selection, setSelection] = useState<string | null>('capture');
    return (
      <Inbox
        project={project}
        branchName="Texte principal"
        branches={{
          activeBranch: 'main',
          branches: [
            {
              id: 'main',
              name: 'Texte principal',
              isMain: true,
              created: '',
              baseVersion: null,
              headVersion: null,
            },
          ],
        }}
        onBranch={async () => {}}
        selectedId={selection}
        onSelection={setSelection}
        onClose={closed}
        onOpenProject={async () => {}}
        onCreate={() => {}}
        onBeforeTransfer={async () => {}}
        onImported={imported}
        onTransferred={transferred}
        onError={failed}
        onNotice={() => {}}
      />
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;
  try {
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toContain('Été 🌿');
    await act(async () => button('Ranger dans ce projet').click());
    expect(failed).toHaveBeenCalledWith(Error('réponse perdue'));
    expect(imported).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    await act(async () => button('Ranger dans ce projet').click());
    const operations = runtime.request.mock.calls.filter(([type]) => type === 'inboxTransfer');
    expect(operations[1][1]).toEqual(operations[0][1]);
    expect(transferred).toHaveBeenCalledOnce();
    expect(imported).not.toHaveBeenCalled();
    expect(host.querySelector('dialog')!.open).toBe(true);
    await act(async () => button('Rejoindre le texte').click());
    expect(imported).toHaveBeenCalledWith('imported');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    HTMLDialogElement.prototype.showModal = show;
    HTMLDialogElement.prototype.close = close;
  }
});
