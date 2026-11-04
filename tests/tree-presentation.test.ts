import { expect, it } from 'vitest';
import { branchGuides, inclusionBySection } from '../src/project/treePresentation';
import { visibleTree } from '../src/project/visibleTree';
import type { Section } from '../src/contracts/project';
const s = (
  id: string,
  parent: string | null,
  kind: Section['kind'],
  position: number,
): Section => ({
  id,
  title: id,
  parent,
  kind,
  position,
  text: '',
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});
it('continues ancestor lines only when another sibling follows, including collapsed branches', () => {
  const sections = [
    s('root', null, 'folder', 0),
    s('a', 'root', 'chapter', 1),
    s('leaf', 'a', 'scene', 2),
    s('b', 'root', 'chapter', 3),
    s('last', 'b', 'scene', 4),
  ];
  const guides = branchGuides(visibleTree(sections, new Set()));
  expect(guides[0].hasChildren).toBe(true);
  expect(guides[1].isLast).toBe(false);
  expect(guides[2].guides).toEqual([true]);
  expect(guides[4].guides).toEqual([false]);
  expect(guides[4].isLast).toBe(true);
  const collapsed = branchGuides(visibleTree(sections, new Set(['a'])));
  expect(collapsed[1].hasChildren).toBe(false);
  expect(collapsed[1].isLast).toBe(false);
});
it('counts manuscript inclusion through groups and ignores trash and empty containers', () => {
  const counts = inclusionBySection([
    s('root', null, 'folder', 0),
    s('a', 'root', 'scene', 1),
    { ...s('b', 'root', 'scene', 2), included: false },
    { ...s('trash', 'root', 'scene', 3), trashed: true },
    s('empty', null, 'chapter', 4),
  ]);
  expect(counts.get('root')).toEqual({ total: 2, included: 1 });
  expect(counts.get('empty')).toEqual({ total: 0, included: 0 });
});

it('exports only included scenes and their ancestors, without empty excluded chapters', async () => {
  const { manuscriptSections } = await import('../src/project/tree');
  const sections = [
    s('root', null, 'folder', 0),
    s('chapter', 'root', 'chapter', 0),
    { ...s('work', 'chapter', 'scene', 0), included: false },
    s('included', 'root', 'scene', 1),
  ];
  expect(manuscriptSections(sections).map((s) => s.id)).toEqual(['root', 'included']);
});
