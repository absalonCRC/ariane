import { expect, it } from 'vitest';
import type { Project } from '../src/contracts/project';
import type { EntityBatch } from '../src/contracts/entities';
import {
  lineProperties,
  lineMentions,
  validPropertyValue,
  lineReferenceSection,
} from '../src/tags/properties';
import { applyTagOperation, validateTag } from '../src/tags/model';
function fixture(): Project {
  return {
    path: 'test',
    name: 'Propriétés',
    recovered: false,
    settings: {},
    smartTags: [
      {
        id: 'person',
        name: 'personne',
        color: '#54826b',
        category: '',
        properties: [
          { id: 'name', name: 'Nom', type: 'text', defaultValue: 'Inconnu' },
          { id: 'date', name: 'Date', type: 'date', inherit: false },
          { id: 'mentions', name: 'Personnes citées', type: 'relation', entityType: 'Personne' },
          { id: 'initiated', name: 'Initié à', type: 'relation' },
        ],
      },
    ],
    sections: [
      {
        id: 's',
        kind: 'scene',
        parent: null,
        title: 'Portrait',
        position: 0,
        revision: 1,
        synopsis: '',
        status: '',
        goal: 0,
        text: 'Parent\nClaude Nougaro',
        outline: {
          version: 1,
          nodes: [
            {
              id: 'a',
              parent: null,
              start: 0,
              tagIds: ['person'],
              properties: { name: 'Hérité', date: '2026-11-05' },
            },
            { id: 'b', parent: 'a', start: 7 },
          ],
        },
      },
    ],
  };
}
function batch(p: Project): EntityBatch {
  return {
    section: 's',
    revision: 1,
    text: p.sections[0].text,
    mentions: [
      {
        from: 7,
        to: 21,
        title: 'Claude Nougaro',
        kind: 'person',
        sourceId: 'note-claude',
        entityId: 'entity-claude',
      },
    ],
  };
}
it('resolves a linked stable line after it moves to another page without guessing an ambiguous target', () => {
  const p = fixture();
  expect(lineReferenceSection(p, 's', 'b')).toBe('s');
  const child = p.sections[0].outline!.nodes.pop()!;
  p.sections.push({
    ...p.sections[0],
    id: 'new',
    text: 'Claude Nougaro',
    outline: { version: 1, nodes: [{ ...child, parent: null, start: 0 }] },
  });
  expect(lineReferenceSection(p, 's', 'b')).toBe('new');
  p.sections.push({ ...p.sections[1], id: 'duplicate' });
  expect(lineReferenceSection(p, 'missing', 'b')).toBeUndefined();
});
it('resolves inherited fields dynamically without copying them to children and retains explicit overrides', () => {
  const p = fixture(),
    child = p.sections[0].outline!.nodes[1];
  expect(
    lineProperties(p, 's', 'b').map(({ field, value, origin }) => [field.id, value, origin]),
  ).toEqual([
    ['name', 'Hérité', 'inherited'],
    ['date', null, 'default'],
    ['mentions', null, 'default'],
    ['initiated', null, 'default'],
  ]);
  expect(child.properties).toBeUndefined();
  child.properties = { name: 'Saisi' };
  p.sections[0].outline!.nodes[0].properties!.name = 'Modifié';
  expect(lineProperties(p, 's', 'b')[0]).toMatchObject({ value: 'Saisi', origin: 'direct' });
  delete child.properties.name;
  expect(lineProperties(p, 's', 'b')[0].value).toBe('Modifié');
  child.parent = null;
  expect(lineProperties(p, 's', 'b')).toEqual([]);
  child.tagIds = ['person'];
  expect(lineProperties(p, 's', 'b')[0]).toMatchObject({ value: 'Inconnu', origin: 'default' });
});
it('uses only current, unambiguous note mentions for configured fields without inferring semantic relations', () => {
  const p = fixture(),
    batches = [batch(p)],
    child = p.sections[0].outline!.nodes[1];
  expect(lineProperties(p, 's', 'b', batches)[2]).toMatchObject({
    origin: 'detected',
    value: [{ kind: 'source', id: 'note-claude', title: 'Claude Nougaro' }],
  });
  expect(lineProperties(p, 's', 'b', batches)[3].value).toBeNull();
  child.properties = { mentions: [{ kind: 'source', id: 'manual', title: 'Choix personnel' }] };
  expect(lineProperties(p, 's', 'b', batches)[2]).toMatchObject({
    origin: 'direct',
    value: child.properties.mentions,
  });
  child.properties.mentions = null;
  expect(lineProperties(p, 's', 'b', batches)[2].value).toBeNull();
  expect(lineMentions(p, 's', 'a', batches)).toEqual([]);
  batches[0].text += ' périmé';
  expect(lineMentions(p, 's', 'b', batches)).toEqual([]);
  batches[0] = batch(p);
  batches[0].mentions[0].sourceId = null;
  expect(lineMentions(p, 's', 'b', batches)).toEqual([]);
});
it('validates typed defaults and keeps property identities and values across tag merges', () => {
  const p = fixture(),
    tag = p.smartTags![0];
  expect(validPropertyValue({ id: 'd', name: 'Date', type: 'date' }, '2026-02-30')).toBe(false);
  expect(validPropertyValue({ id: 'n', name: 'Nombre', type: 'number' }, '42')).toBe(false);
  expect(
    validPropertyValue({ id: 'r', name: 'Lien', type: 'relation' }, [
      { kind: 'line', section: 's', node: 'a', title: 'Parent' },
    ]),
  ).toBe(true);
  expect(() =>
    validateTag(
      { ...tag, properties: [{ id: 'd', name: 'Date', type: 'date', defaultValue: 'demain' }] },
      p.smartTags!,
    ),
  ).toThrow();
  p.smartTags!.push({
    id: 'target',
    name: 'cible',
    color: '#a9614b',
    category: '',
    properties: [],
  });
  const before = structuredClone(p.sections[0]);
  applyTagOperation(p, { action: 'merge', id: 'person', target: 'target' });
  expect(p.smartTags![0].properties).toEqual(tag.properties);
  expect(p.sections[0].outline!.nodes[0].properties).toEqual(before.outline!.nodes[0].properties);
  expect(lineProperties(p, 's', 'b')[0].value).toBe('Hérité');
});
