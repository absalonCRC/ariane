// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Project } from '../src/contracts/project';
import { useProject } from '../src/project/useProject';
import { applyTagOperation } from '../src/tags/model';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request }));
it('waits for automatic tag work before flushing and serializes distinct colors and duplicate names', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let hook!: ReturnType<typeof useProject>;
  function Harness() {
    hook = useProject(vi.fn());
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const p: Project = {
    path: 'tag-save',
    name: 'Tags',
    settings: {},
    recovered: false,
    sections: [
      {
        id: 's',
        title: 'Scène',
        kind: 'scene',
        parent: null,
        position: 0,
        revision: 0,
        text: 'Texte',
        synopsis: '',
        status: '',
        goal: 0,
      },
    ],
  };
  const backend = structuredClone(p);
  request.mockReset();
  request.mockImplementation(async (type, args) => {
    if (type === 'smartTagOperation') {
      applyTagOperation(backend, args.operation);
      return structuredClone(backend);
    }
    if (type === 'save') return { sections: [{ id: 's', revision: 1 }], mirrorErrors: [] };
    return null;
  });
  await act(async () => root.render(<Harness />));
  try {
    await act(async () => hook.activate(p));
    await act(async () => {
      const work = (async () => {
        const tag = await hook.createSmartTag('histoire');
        hook.edit(
          new Map([['s', 'Texte après']]),
          new Map([
            ['s', { version: 1, nodes: [{ id: 'n', parent: null, start: 0, tagIds: [tag.id] }] }],
          ]),
        );
      })();
      hook.trackTagWork(work);
      await hook.flush();
    });
    expect(request.mock.calls.map(([type]) => type)).toEqual(['smartTagOperation', 'save']);
    expect(request.mock.calls[1][1].patches[0]).toMatchObject({
      text: 'Texte après',
      outline: { nodes: [{ tagIds: [backend.smartTags![0].id] }] },
    });
    await act(async () => {
      await Promise.all([
        hook.createSmartTag('autre'),
        hook.createSmartTag('autre'),
        hook.createSmartTag('dernier'),
      ]);
    });
    expect(hook.ref.current!.smartTags).toHaveLength(3);
    expect(new Set(hook.ref.current!.smartTags!.map((t) => t.color)).size).toBe(3);
    expect(hook.status).toBe('saved');
    const commit = vi.fn(async () => {
      const tag = await hook.createSmartTag('fin');
      hook.edit(
        new Map([['s', 'Fin']]),
        new Map([
          ['s', { version: 1, nodes: [{ id: 'n', parent: null, start: 0, tagIds: [tag.id] }] }],
        ]),
      );
    });
    const unregister = hook.registerTagFlusher(commit);
    await act(async () => hook.checkpoint());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.filter(([type]) => type === 'save').at(-1)![1].patches[0].text).toBe(
      'Fin',
    );
    const generation = hook.generation;
    await act(async () => {
      hook.edit(new Map([['s', 'Brouillon plus récent']]));
      const work = Promise.all(
        backend.smartTags!.slice(0, 2).map((tag) => hook.addSectionTag('s', tag.id)),
      ).then(() => {});
      hook.trackTagWork(work);
      await hook.flush();
    });
    expect(hook.generation).toBe(generation);
    expect(hook.ref.current!.sections[0].text).toBe('Brouillon plus récent');
    expect(hook.ref.current!.sections[0].tagIds).toHaveLength(2);
    await act(async () => {
      await Promise.all(
        hook.ref.current!.sections[0].tagIds!.map((id) => hook.removeTagAssignment('s', null, id)),
      );
    });
    expect(hook.ref.current!.sections[0].tagIds).toEqual([]);
    expect(hook.ref.current!.smartTags).toHaveLength(backend.smartTags!.length);
    expect(request.mock.calls.filter(([type]) => type === 'save').at(-1)![1].patches[0].text).toBe(
      'Brouillon plus récent',
    );
    unregister();
    await act(async () => hook.checkpoint());
    expect(commit).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
  }
});
