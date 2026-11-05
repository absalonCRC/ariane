// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Project } from '../src/contracts/project';
import { TagFilterView } from '../src/tags/TagFilterView';
it('shows all pages in text or table mode with inherited, default and linked properties', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const tag = {
    id: 'h',
    name: 'histoire',
    color: '#54826b',
    category: '',
    properties: [
      { id: 'name', name: 'Résumé', type: 'text' as const, defaultValue: 'À préciser' },
      { id: 'ref', name: 'Référence', type: 'relation' as const },
    ],
  };
  const scene = (id: string, text: string) => ({
    id,
    text,
    title: id,
    parent: null,
    kind: 'scene' as const,
    position: 0,
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  });
  const p: Project = {
    path: 'test',
    name: 'Pages',
    settings: {},
    recovered: false,
    smartTags: [tag],
    sections: [
      {
        ...scene('Première page', 'Parent\nEnfant'),
        outline: {
          version: 1,
          nodes: [
            {
              id: 'a',
              parent: null,
              start: 0,
              tagIds: ['h'],
              properties: {
                name: 'Secret',
                ref: [{ kind: 'source', id: 'note', title: 'Une note' }],
              },
            },
            { id: 'b', parent: 'a', start: 7 },
          ],
        },
      },
      {
        ...scene('Deuxième page', 'Autre passage'),
        tagIds: ['h'],
        outline: { version: 1, nodes: [{ id: 'c', parent: null, start: 0 }] },
      },
    ],
  };
  const original = structuredClone(p),
    open = vi.fn(),
    relation = vi.fn(),
    host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  const render = (mode: 'text' | 'table') => (
    <TagFilterView
      project={p}
      tag={tag}
      mode={mode}
      onClose={() => {}}
      onOpen={open}
      onRelation={relation}
      onTag={() => {}}
    />
  );
  try {
    await act(async () => root.render(render('text')));
    expect(host.textContent).toContain('3 passages dans 2 textes');
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelectorAll('.tag-filter-passage')).toHaveLength(3);
    await act(async () => root.render(render('table')));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(host.querySelector('thead')?.textContent).toContain('Résumé');
    expect(host.querySelector('tbody')?.textContent).toContain('Hérité');
    expect(host.querySelector('tbody tr:last-child')?.textContent).toContain('À préciser');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.tag-table-relations button')!.click(),
    );
    expect(relation).toHaveBeenCalledWith({ kind: 'source', id: 'note', title: 'Une note' });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('tbody tr:last-child .tag-table-passage')!.click(),
    );
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'Deuxième page', node: 'c' }),
    );
    expect(p).toEqual(original);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
