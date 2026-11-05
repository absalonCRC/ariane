import { expect, it } from 'vitest';
import type { Section } from '../src/contracts/project';
import { effectiveTags, tagUsages, applyTagOperation, nextTagColor } from '../src/tags/model';
import { taggedPassages } from '../src/tags/passages';
const tags = [
  { id: 'place', name: 'Paris', color: '#72816a', category: 'Lieu' },
  { id: 'thread', name: 'Enquête', color: '#986b56', category: 'Intrigue' },
  { id: 'own', name: 'Secret', color: '#717a98', category: '' },
];
const sections: Section[] = [
  {
    id: 'chapter',
    parent: null,
    title: 'Chapitre',
    kind: 'chapter',
    position: 0,
    text: '',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
    tagIds: ['place'],
  },
  {
    id: 'scene',
    parent: 'chapter',
    title: 'Scène',
    kind: 'scene',
    position: 1,
    text: 'A\nB',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
    tagIds: ['place'],
    outline: {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0, tagIds: ['thread'] },
        { id: 'b', parent: 'a', start: 2, tagIds: ['own', 'place'] },
      ],
    },
  },
];
it('unions both hierarchies, prefers direct provenance, and reevaluates a moved branch', () => {
  const result = effectiveTags(tags, sections, 'scene', 'b');
  expect(result.map((v) => v.tag.id)).toEqual(['own', 'place', 'thread']);
  expect(result.find((v) => v.tag.id === 'place')?.inherited).toBe(false);
  expect(result.find((v) => v.tag.id === 'thread')).toMatchObject({
    inherited: true,
    section: 'scene',
    node: 'a',
  });
  const moved = structuredClone(sections);
  moved[1].outline!.nodes[1].parent = null;
  expect(effectiveTags(tags, moved, 'scene', 'b').map((v) => v.tag.id)).toEqual(['own', 'place']);
  expect(tagUsages(sections, 'place')).toBe(3);
});
it('keeps identities on rename and merges every explicit reference without touching text', () => {
  const p = {
    path: 'x',
    name: 'X',
    settings: {},
    recovered: false,
    sections: structuredClone(sections),
    smartTags: structuredClone(tags),
  };
  applyTagOperation(p, { action: 'save', tag: { ...tags[0], name: 'Paris de nuit' } });
  expect(p.sections[0].tagIds).toEqual(['place']);
  applyTagOperation(p, { action: 'merge', id: 'place', target: 'own' });
  expect(p.sections[1].text).toBe('A\nB');
  expect(p.sections[1].outline!.nodes[1].tagIds).toEqual(['own']);
  expect(p.smartTags.map((v) => v.id)).toEqual(['thread', 'own']);
});
it('assigns distinct colors and projects all matching originals with inherited tags', () => {
  const definitions: import('../src/contracts/smartTags').SmartTag[] = [];
  for (let i = 0; i < 80; i++)
    definitions.push({
      id: String(i),
      name: String(i),
      color: nextTagColor(definitions),
      category: '',
    });
  expect(new Set(definitions.map((t) => t.color)).size).toBe(80);
  const p = {
    path: 'x',
    name: 'X',
    settings: {},
    recovered: false,
    sections: structuredClone(sections),
    smartTags: tags,
  };
  const before = structuredClone(p);
  expect(taggedPassages(p, 'place').map((p) => p.text)).toEqual(['A', 'B']);
  expect(taggedPassages(p, 'thread').map((p) => [p.node, p.inherited])).toEqual([
    ['a', false],
    ['b', true],
  ]);
  expect(p).toEqual(before);
  applyTagOperation(p, { action: 'assign', section: 'scene', node: 'b', tagIds: ['thread'] });
  expect(taggedPassages(p, 'own')).toEqual([]);
});

it('projects matching lines from every page, including title inheritance and working notes', () => {
  const p = {
    path: 'multi',
    name: 'Pages',
    settings: {},
    recovered: false,
    smartTags: tags,
    sections: structuredClone(sections),
  };
  p.sections.push({
    ...structuredClone(sections[1]),
    id: 'other-page',
    title: 'Autre page',
    parent: null,
    role: 'note',
    included: false,
    tagIds: ['thread'],
    outline: {
      version: 1,
      nodes: [
        { id: 'x', parent: null, start: 0 },
        { id: 'y', parent: 'x', start: 2 },
      ],
    },
  });
  expect(
    taggedPassages(p, 'thread').map(({ section, node, inherited }) => [section, node, inherited]),
  ).toEqual([
    ['scene', 'a', false],
    ['scene', 'b', true],
    ['other-page', 'x', true],
    ['other-page', 'y', true],
  ]);
});
