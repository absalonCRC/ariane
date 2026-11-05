// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useWorkspace } from '../src/app/useWorkspace';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request, native: false }));

it('opens the sidebar on demand in focus and restores its previous state on exit', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
        name: 'Roman',
        settings: {},
        sections: [],
        recovered: false,
      }),
    );
    await act(async () => workspace.setBinder(true));
    await act(async () => workspace.toggleFocus());
    expect(workspace.doc.settings.immersiveFocus).toBe(true);
    expect(workspace.binder).toBe(false);

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, shiftKey: true }),
      );
    });
    expect(workspace.binder).toBe(true);
    expect(workspace.doc.settings.immersiveFocus).toBe(true);
    await act(async () => workspace.setBinder(false));
    await act(async () => workspace.toggleFocus());
    expect(workspace.doc.settings.immersiveFocus).toBe(false);
    expect(workspace.binder).toBe(true);

    await act(async () => workspace.setBinder(false));
    await act(async () => workspace.toggleFocus());
    await act(async () => workspace.setBinder(true));
    await act(async () => workspace.toggleFocus());
    expect(workspace.doc.settings.immersiveFocus).toBe(false);
    expect(workspace.binder).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
