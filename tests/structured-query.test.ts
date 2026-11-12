import { expect, it } from 'vitest';
import { parseQuery } from '../src/search/query';
import { resolveQuery, queryLabel } from '../src/search/resolveQuery';
import { evaluateQuery } from '../src/search/evaluateQuery';
import { emptyCatalog } from '../src/entities/model';
import type { Project } from '../src/contracts/project';
const tags = [
  { id: 'a', name: 'Enquête', color: '#123456', category: '' },
  { id: 'b', name: 'à revoir', color: '#345678', category: '' },
];
const project: Project = {
  path: 'test',
  name: 'Test',
  recovered: false,
  settings: {},
  smartTags: tags,
  sections: [
    {
      id: 's',
      parent: null,
      kind: 'scene',
      title: 'Page',
      position: 0,
      text: 'Christianisme 🌿\nEnfant\nAutre',
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
      outline: {
        version: 1,
        nodes: [
          { id: 'x', parent: null, start: 0, tagIds: ['a'] },
          { id: 'y', parent: 'x', start: 17, tagIds: ['b'] },
          { id: 'z', parent: null, start: 24, tagIds: ['b'] },
        ],
      },
    },
  ],
};
it('parses quoted/spaced names and intersection before union, rejects incomplete syntax', () => {
  expect(parseQuery('#enquête + #à revoir, @"Marie Curie"')).toEqual([
    [
      { kind: 'tag', name: 'enquête' },
      { kind: 'tag', name: 'à revoir' },
    ],
    [{ kind: 'entity', name: 'Marie Curie' }],
  ]);
  for (const q of ['#', '#x +', '#x,', '@"Curie', '#a #b', '#"x" @y'])
    expect(() => parseQuery(q)).toThrow();
});
it('resolves stable IDs, homonyms explicitly, and follows rename and fusion redirects', () => {
  const catalog = emptyCatalog();
  catalog.entities.push({
    id: 'c',
    title: 'Christianisme',
    kind: 'Concept',
    aliases: [],
    sourceIds: [],
    detectedIds: [],
    confirmed: true,
  });
  const q = resolveQuery('@christianisme + #ENQUETE', tags, catalog);
  expect(q.groups[0][1].id).toBe('a');
  const renamed = [{ ...tags[0], name: 'Dossier' }, tags[1]];
  expect(queryLabel(q, renamed, catalog)).toBe('@"Christianisme" + #"Dossier"');
  catalog.entities.push({ ...catalog.entities[0], id: 'd' });
  expect(() => resolveQuery('@christianisme', tags, catalog)).toThrow(/Plusieurs/);
  expect(
    resolveQuery('@christianisme', tags, catalog, { 'entity:christianisme': 'd' }).groups[0][0].id,
  ).toBe('d');
  catalog.entities[0].redirect = 'd';
  expect(queryLabel(q, renamed, catalog)).toContain('Christianisme');
});
it('projects exact originals with inherited tags and mixed entity/tag filters without modifying text', () => {
  const catalog = emptyCatalog();
  catalog.entities.push({
    id: 'c',
    title: 'Christianisme',
    kind: 'Concept',
    aliases: [],
    sourceIds: [],
    detectedIds: [],
    confirmed: true,
  });
  const before = JSON.stringify(project);
  const intersection = evaluateQuery(
    project,
    resolveQuery('#enquête + #à revoir', tags, catalog),
    catalog,
    [],
    [],
  );
  expect(intersection.passages.map((p) => p.node)).toEqual(['y']);
  const union = evaluateQuery(
    project,
    resolveQuery('#enquête, #à revoir', tags, catalog),
    catalog,
    [],
    [],
  );
  expect(union.passages).toHaveLength(3);
  const mixed = evaluateQuery(
    project,
    resolveQuery('@christianisme + #enquête', tags, catalog),
    catalog,
    [],
    [],
  );
  expect(mixed.passages.map((p) => p.node)).toEqual(['x']);
  expect(JSON.stringify(project)).toBe(before);
});
it('does not assign an ambiguous homonym or silently replace a missing saved reference', () => {
  const catalog = emptyCatalog();
  const e = {
    id: 'c',
    title: 'Christianisme',
    kind: 'Concept',
    aliases: [],
    sourceIds: [],
    detectedIds: [],
    confirmed: true,
  };
  catalog.entities = [e, { ...e, id: 'd' }];
  const result = evaluateQuery(
    project,
    { version: 1, groups: [[{ kind: 'entity', id: 'c' }]] },
    catalog,
    [],
    [],
  );
  expect(result.passages).toHaveLength(0);
  expect(result.ambiguous).toBe(1);
  expect(() =>
    queryLabel({ version: 1, groups: [[{ kind: 'tag', id: 'missing' }]] }, tags, catalog),
  ).toThrow(/introuvable/);
});
it('keeps resolved mention identities across a renamed title, rejects stale batches', () => {
  const catalog = emptyCatalog();
  catalog.entities.push({
    id: 'e',
    title: 'Nom renommé',
    kind: 'Concept',
    aliases: [],
    sourceIds: ['source'],
    detectedIds: [],
    confirmed: true,
  });
  const q = { version: 1 as const, groups: [[{ kind: 'entity' as const, id: 'e' }]] };
  const batch = {
    section: 's',
    revision: 0,
    text: project.sections[0].text,
    mentions: [
      {
        from: 0,
        to: 13,
        title: 'Christianisme',
        kind: 'Concept',
        sourceId: 'source',
        entityId: null,
      },
    ],
  };
  expect(evaluateQuery(project, q, catalog, [batch], []).passages.map((p) => p.node)).toEqual([
    'x',
  ]);
  expect(
    evaluateQuery(project, q, catalog, [{ ...batch, text: 'Ancien texte' }], []).passages,
  ).toHaveLength(0);
});
