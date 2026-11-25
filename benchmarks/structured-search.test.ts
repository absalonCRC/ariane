import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Project, Section } from '../src/contracts/project';
import { emptyCatalog } from '../src/entities/model';
import { evaluateQuery } from '../src/search/evaluateQuery';

const report = process.env.ARIANE_STRUCTURED_SEARCH_REPORT;

it.skipIf(!report)('measures structured search over current and legacy scenes', () => {
  const sections: Section[] = Array.from({ length: 8 }, (_, scene) => {
    const paragraphs = Array.from(
      { length: 48 },
      (_, index) =>
        `À la scène ${scene + 1}, Léa relit le passage ${index + 1} 🌿. Léa prend des notes.`,
    );
    let start = 0;
    const nodes = paragraphs.map((paragraph, index) => {
      const node = { id: `n${scene}-${index}`, start, parent: null };
      start += paragraph.length + 2;
      return node;
    });
    return {
      id: `s${scene}`,
      title: `Scène ${scene}`,
      position: scene,
      parent: null,
      kind: 'scene',
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
      text: paragraphs.join('\n\n'),
      outline: scene % 2 ? null : { version: 1, nodes },
    };
  });
  const project: Project = {
    path: 'synthetic',
    name: 'Recherche',
    settings: {},
    recovered: false,
    sections,
  };
  const catalog = emptyCatalog();
  catalog.entities.push({
    id: 'lea',
    title: 'Léa',
    kind: 'Personnage',
    aliases: [],
    sourceIds: [],
    detectedIds: [],
    confirmed: true,
  });
  const search = () =>
    evaluateQuery(
      project,
      { version: 1, groups: [[{ kind: 'entity', id: 'lea' }]] },
      catalog,
      [],
      [],
    );
  const result = search();
  expect(result.passages).toHaveLength(384);
  const samplesMs = [];
  for (let run = 0; run < 9; run++) {
    const start = performance.now();
    const next = search();
    samplesMs.push(performance.now() - start);
    expect(next).toEqual(result);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  writeFileSync(
    report!,
    JSON.stringify(
      {
        scenes: 8,
        mentions: 768,
        passages: result.passages.length,
        samplesMs,
        medianMs: sorted[4],
        digest: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      },
      null,
      2,
    ),
  );
});
