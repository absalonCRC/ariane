// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useWorkspaceCommands } from '../src/app/commands/useWorkspaceCommands';

const events = vi.hoisted(() => ({ callback: (_event: { payload: string }) => {}, stop: vi.fn() }));
vi.mock('../src/platform/client', () => ({ native: true }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_event: string, callback: typeof events.callback) => {
    events.callback = callback;
    return events.stop;
  },
}));

it('garde la navigation native et sa sauvegarde distinctes des actions de palette', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const openSurface = vi.fn(),
    setSurface = vi.fn(),
    flush = vi.fn(async () => {}),
    checkpoint = vi.fn(async () => {}),
    setNewProject = vi.fn();
  const context = {
    p: { path: 'fixture' },
    doc: { settings: {}, flush, checkpoint },
    libraryLock: { current: false },
    newProject: false,
    openSurface,
    setSurface,
    setNewProject,
    fail: vi.fn(),
    editor: { current: null },
  } as unknown as Parameters<typeof useWorkspaceCommands>[0];
  let commands: ReturnType<typeof useWorkspaceCommands> = [];
  function Harness() {
    commands = useWorkspaceCommands(context);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    for (const id of ['import', 'export', 'history', 'preferences', 'sources']) {
      await act(async () => events.callback({ payload: id }));
      expect(openSurface).toHaveBeenLastCalledWith(id);
    }
    expect(setSurface).not.toHaveBeenCalled();
    await act(async () => events.callback({ payload: 'new-project' }));
    expect(flush).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(setNewProject).toHaveBeenCalledWith(true);
    await act(async () => {
      commands.find((command) => command.id === 'new-project')!.action();
    });
    expect(checkpoint).toHaveBeenCalledOnce();
    context.libraryLock.current = true;
    openSurface.mockClear();
    await act(async () => events.callback({ payload: 'history' }));
    expect(openSurface).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
  expect(events.stop).toHaveBeenCalledOnce();
});
