// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Outline, Project } from '../src/contracts/project';
import { sectionDraft } from '../src/project/draft';
import { useProject } from '../src/project/useProject';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request }));

it.each(['eager', 'deferred'])(
  'un accusé ancien ne supprime pas une indentation plus récente (%s)',
  async (mode) => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let hook!: ReturnType<typeof useProject>;
    const onError = vi.fn();
    function Harness() {
      hook = useProject(onError);
      return null;
    }
    const host = document.createElement('div'),
      root = createRoot(host);
    let resolve!: (value: {
      sections: { id: string; revision: number }[];
      mirrorErrors: [];
    }) => void;
    request
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce({ sections: [{ id: 'scene', revision: 2 }], mirrorErrors: [] });
    const outline: Outline = {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: 2 },
      ],
    };
    const project: Project = {
      path: 'test',
      name: 'Test',
      settings: {},
      recovered: false,
      sections: [
        {
          id: 'scene',
          title: 'Test',
          text: 'A\nB',
          outline,
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
    await act(async () => root.render(<Harness />));
    await act(async () => hook.activate(project));
    let saving!: Promise<void>;
    await act(async () => {
      if (mode === 'deferred')
        hook.editDraft(new Map([['scene', sectionDraft(() => ({ text: 'A\nB', outline }))]]));
      else hook.edit(new Map([['scene', 'A\nB']]), new Map([['scene', outline]]));
      saving = hook.flush();
    });
    const indented: Outline = {
      version: 1,
      nodes: [outline.nodes[0], { ...outline.nodes[1], parent: 'a' }],
    };
    await act(async () => {
      if (mode === 'deferred')
        hook.editDraft(
          new Map([['scene', sectionDraft(() => ({ text: 'A\nB', outline: indented }))]]),
        );
      else hook.edit(new Map([['scene', 'A\nB']]), new Map([['scene', indented]]));
    });
    await act(async () => {
      resolve({ sections: [{ id: 'scene', revision: 1 }], mirrorErrors: [] });
      await saving;
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].patches[0]).toMatchObject({ revision: 1, outline: indented });
    expect(hook.status).toBe('saved');
    expect(hook.ref.current!.sections[0].outline).toEqual(indented);
    expect(onError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  },
);
