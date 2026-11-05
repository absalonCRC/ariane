// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Project } from '../src/app/types';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ request }));
import { useProject } from '../src/project/useProject';
import { sectionDraft } from '../src/project/draft';

let hook: ReturnType<typeof useProject>, root: Root;
const onError = vi.fn();
const project = (path = 'test'): Project => ({
  path,
  name: 'Test',
  settings: {},
  recovered: false,
  sections: [
    {
      id: 'scene',
      title: 'Début',
      kind: 'scene',
      parent: null,
      position: 0,
      revision: 0,
      text: '',
      outline: null,
      synopsis: '',
      status: '',
      goal: 0,
    },
  ],
});
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  request.mockReset();
  onError.mockReset();
  request.mockImplementation(async (type) =>
    type === 'save' ? { sections: [{ id: 'scene', revision: 1 }], mirrorErrors: [] } : null,
  );
  function Harness() {
    hook = useProject(onError);
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  await act(async () => hook.activate(project()));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
it.each(['eager', 'deferred'])(
  'saves promptly, then checkpoints after a real pause (%s)',
  async (mode) => {
    await act(async () => {
      if (mode === 'deferred')
        hook.editDraft(
          new Map([['scene', sectionDraft(() => ({ text: 'Biographie.', outline: null }))]]),
        );
      else hook.edit(new Map([['scene', 'Biographie.']]));
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(request.mock.calls.map(([type]) => type)).toEqual(['save']);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(89_350);
    });
    expect(request).toHaveBeenLastCalledWith('automaticVersion', {
      projectPath: 'test',
      scope: 'scene',
    });
    const count = request.mock.calls.length;
    await act(async () => {
      await hook.checkpoint();
    });
    expect(request).toHaveBeenCalledTimes(count);
    expect(onError).not.toHaveBeenCalled();
  },
);
it('resets the idle delay when writing resumes and flushes before leaving', async () => {
  await act(async () => {
    hook.edit(new Map([['scene', 'A']]));
    await vi.advanceTimersByTimeAsync(60_000);
  });
  await act(async () => {
    hook.edit(new Map([['scene', 'AB']]));
    await vi.advanceTimersByTimeAsync(40_000);
  });
  expect(request.mock.calls.filter(([type]) => type === 'automaticVersion')).toHaveLength(0);
  await act(async () => {
    await hook.checkpoint();
  });
  expect(request).toHaveBeenLastCalledWith('automaticVersion', {
    projectPath: 'test',
    scope: 'scene',
  });
});
it('does not let a late checkpoint clear changes in a newly activated project', async () => {
  let done!: () => void;
  request.mockImplementation(async (type) =>
    type === 'save'
      ? { sections: [{ id: 'scene', revision: 1 }], mirrorErrors: [] }
      : new Promise<void>((resolve) => {
          done = resolve;
        }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    hook.edit(new Map([['scene', 'Ancien']]));
    pending = hook.checkpoint();
  });
  await act(async () => {
    hook.activate(project('new'));
    hook.edit(new Map([['scene', 'Nouveau']]));
    done();
    await pending;
  });
  request.mockResolvedValue({ sections: [{ id: 'scene', revision: 1 }], mirrorErrors: [] });
  await act(async () => {
    await hook.checkpoint();
  });
  expect(request).toHaveBeenLastCalledWith('automaticVersion', {
    projectPath: 'new',
    scope: 'scene',
  });
});
it('keeps a failed checkpoint pending for retry', async () => {
  await act(async () => {
    hook.edit(new Map([['scene', 'A']]));
    await hook.flush();
  });
  request.mockRejectedValueOnce(new Error('disk full'));
  await expect(hook.checkpoint()).rejects.toThrow('disk full');
  request.mockResolvedValueOnce(null);
  await act(async () => {
    await hook.checkpoint();
  });
  expect(request).toHaveBeenLastCalledWith('automaticVersion', {
    projectPath: 'test',
    scope: 'scene',
  });
});

it('reports an automatic-version failure independently of the saved text', async () => {
  await act(async () => {
    hook.edit(new Map([['scene', 'Texte conservé']]));
    await hook.flush();
  });
  request.mockRejectedValueOnce(new Error('snapshot failed'));
  await act(async () => {
    await expect(hook.checkpoint()).rejects.toThrow('snapshot failed');
  });
  expect(hook.status).toBe('saved');
  expect(hook.versionStatus).toBe('error');
  request.mockResolvedValueOnce(null);
  await act(async () => hook.checkpoint());
  expect(hook.versionStatus).toBe('saved');
});
it('waits for pending settings before allowing a workspace switch', async () => {
  let done!: () => void;
  request.mockImplementation((type) =>
    type === 'settings'
      ? new Promise<void>((resolve) => {
          done = resolve;
        })
      : Promise.resolve({ sections: [], mirrorErrors: [] }),
  );
  await act(async () => hook.configure({ font: 'sans' }));
  let settled = false;
  await act(async () => {
    void hook.flush().then(() => {
      settled = true;
    });
    await Promise.resolve();
  });
  expect(settled).toBe(false);
  await act(async () => {
    done();
    await hook.flush();
  });
  expect(settled).toBe(true);
});

it('notifies the version view only when a checkpoint creates a version', async () => {
  await act(async () => {
    hook.edit(new Map([['scene', 'Texte.']]));
    await hook.flush();
  });
  request.mockResolvedValueOnce({ id: 'checkpoint', name: 'Sauvegarde automatique' });
  await act(async () => hook.checkpoint());
  expect(hook.versionRevision).toBe(1);
  await act(async () => {
    hook.edit(new Map([['scene', 'Texte inchangé.']]));
    await hook.flush();
  });
  request.mockResolvedValueOnce(null);
  await act(async () => hook.checkpoint());
  expect(hook.versionRevision).toBe(1);
});
