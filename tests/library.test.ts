import { describe, it, expect } from 'vitest';
import {
  applyLibraryOperation,
  structureSnapshot,
  type LibraryOperation,
} from '../src/project/library';
import { scenesFor } from '../src/project/tree';
import type { Project, Section } from '../src/app/types';
const section = (
  id: string,
  position: number,
  parent: string | null = null,
  kind: Section['kind'] = 'scene',
): Section => ({
  id,
  title: id,
  position,
  parent,
  kind,
  text: id,
  revision: 0,
  synopsis: '',
  status: 'Brouillon',
  goal: 0,
});
const fixture = (): Project => ({
  path: 'fixture',
  name: 'Livre',
  sections: [
    section('a', 0),
    section('b', 1),
    section('folder', 2, null, 'folder'),
    section('child', 3, 'folder'),
  ],
  recovered: false,
  settings: {},
});
describe('library operations', () => {
  it('moves a selection in manuscript order, including nested selections only once', () => {
    const p = applyLibraryOperation(fixture(), {
      action: 'move',
      ids: ['b', 'a'],
      target: 'folder',
    }).project;
    expect(p.sections.filter((s) => s.parent === 'folder').map((s) => s.id)).toEqual([
      'child',
      'a',
      'b',
    ]);
    const note = applyLibraryOperation(p, {
      action: 'move',
      ids: ['folder', 'child'],
      role: 'note',
    }).project;
    expect(note.sections.every((s) => s.role === 'note')).toBe(true);
    expect(scenesFor(note.sections, null, true)).toHaveLength(3);
    expect(scenesFor(note.sections, 'folder', false)).toHaveLength(3);
  });
  it('undo restores legacy manuscript roles after JSON persistence', () => {
    const p = fixture();
    const before = JSON.parse(JSON.stringify(structureSnapshot(p)));
    const moved = applyLibraryOperation(p, { action: 'move', ids: ['a'], role: 'note' }).project;
    const undone = applyLibraryOperation(moved, { action: 'undo' }, before).project;
    expect(undone.sections.find((s) => s.id === 'a')!.role).toBe('manuscript');
  });
  it('rejects cycles and missing destinations without mutating the project', () => {
    const p = fixture();
    const before = structuredClone(p);
    expect(() =>
      applyLibraryOperation(p, {
        action: 'move',
        ids: ['folder'],
        target: 'child',
        placement: 'before',
      }),
    ).toThrow();
    expect(() =>
      applyLibraryOperation(p, { action: 'move', ids: ['a'], target: 'missing' }),
    ).toThrow();
    expect(p).toEqual(before);
  });
  it('undoes structure without reverting later text and keeps an undone copy recoverable', () => {
    const p = fixture();
    const before = structureSnapshot(p);
    const result = applyLibraryOperation(p, { action: 'duplicate', ids: ['folder', 'child'] });
    expect(result.project.sections).toHaveLength(6);
    const copyId = result.copies.find((c) => c.from === 'child')!.to;
    result.project.sections.find((s) => s.id === copyId)!.text = 'New text';
    const undo = applyLibraryOperation(result.project, { action: 'undo' }, before).project;
    expect(undo.sections).toHaveLength(4);
    expect(undo.trash!.find((s) => s.id === copyId)!.text).toBe('New text');
  });
  it('restores a child with its ancestors but keeps unrelated deleted siblings in trash', () => {
    const p = fixture();
    p.sections.push(section('sibling', 4, 'folder'));
    const deleted = applyLibraryOperation(p, { action: 'trash', ids: ['folder'] }).project;
    expect(deleted.trash).toHaveLength(3);
    const restored = applyLibraryOperation(deleted, { action: 'restore', ids: ['child'] }).project;
    expect(restored.sections.map((s) => s.id)).toEqual(['a', 'b', 'folder', 'child']);
    expect(restored.trash!.map((s) => s.id)).toEqual(['sibling']);
  });
});

it('keeps scenes inside or outside chapters but rejects nested chapters through every destination', () => {
  const p = fixture();
  p.sections.push(section('chapter', 4, null, 'chapter'), section('other', 5, null, 'chapter'));
  const inside = applyLibraryOperation(p, {
    action: 'move',
    ids: ['a'],
    target: 'chapter',
  }).project;
  expect(inside.sections.find((s) => s.id === 'a')!.parent).toBe('chapter');
  expect(
    applyLibraryOperation(inside, {
      action: 'move',
      ids: ['a'],
      target: null,
    }).project.sections.find((s) => s.id === 'a')!.parent,
  ).toBeNull();
  for (const op of [
    { action: 'move', ids: ['other'], target: 'chapter' },
    { action: 'move', ids: ['other'], target: 'a', placement: 'before' },
    { action: 'add', kind: 'chapter', title: 'Nested', target: 'chapter' },
  ] satisfies LibraryOperation[])
    expect(() => applyLibraryOperation(inside, op)).toThrow('Un chapitre ne peut pas');
  const grouped = applyLibraryOperation(p, {
    action: 'move',
    ids: ['other'],
    target: 'folder',
  }).project;
  expect(() =>
    applyLibraryOperation(grouped, { action: 'move', ids: ['folder'], target: 'chapter' }),
  ).toThrow('Un chapitre ne peut pas');
  expect(
    applyLibraryOperation(p, {
      action: 'move',
      ids: ['other'],
      target: 'chapter',
      placement: 'after',
    }).project.sections.find((s) => s.id === 'other')!.parent,
  ).toBeNull();
});

it('keeps working texts editable and searchable while excluding them from continuous reading, including after undo and duplication', () => {
  const before = fixture();
  const p = applyLibraryOperation(before, {
    action: 'include',
    ids: ['folder', 'a'],
    included: false,
  }).project;
  expect(scenesFor(p.sections, null, true).map((s) => s.id)).toEqual(['b']);
  expect(scenesFor(p.sections, 'a', false)[0].text).toBe('a');
  expect(scenesFor(p.sections, 'folder', false)[0].id).toBe('child');
  const copy = applyLibraryOperation(p, { action: 'duplicate', ids: ['a'] });
  expect(copy.project.sections.find((s) => s.id === copy.copies[0].to)?.included).toBe(false);
  p.sections[0].text = 'Texte modifié ensuite';
  const undo = applyLibraryOperation(p, { action: 'undo' }, structureSnapshot(before)).project;
  expect(scenesFor(undo.sections, null, true)).toHaveLength(3);
  expect(undo.sections[0].text).toBe('Texte modifié ensuite');
  const legacySnapshot = structureSnapshot(before).map(({ included: _, ...position }) => position);
  expect(
    applyLibraryOperation(p, { action: 'undo' }, legacySnapshot).project.sections.every(
      (s) => s.included,
    ),
  ).toBe(true);
});

it('inserts a new sibling immediately after a scene without disturbing its parent', () => {
  const p = fixture();
  p.sections.push(section('next', 4, 'folder'));
  const result = applyLibraryOperation(p, {
    action: 'add',
    kind: 'scene',
    title: 'Nouvelle',
    target: 'child',
    placement: 'after',
  }).project;
  expect(result.sections.filter((s) => s.parent === 'folder').map((s) => s.title)).toEqual([
    'child',
    'Nouvelle',
    'next',
  ]);
});
