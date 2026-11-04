import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { EditorState } from '@codemirror/state';
import { history } from '@codemirror/commands';
import { compose, sectionMapping } from '../src/editor/composite';
import { outlineEditor } from '../src/editor/outline/state';
import { ordered } from '../src/project/tree';
import type { Section } from '../src/contracts/project';
// Opt-in: no timing thresholds in CI. Measures state work, not native painting.
it.skipIf(!process.env.ARIANE_PERF_REPORT)(
  'measures a large structured manuscript',
  () => {
    const line = 'La mémoire des lieux accompagne une voix dans la ville. '.repeat(5) + '\n';
    const sections: Section[] = Array.from({ length: 2000 }, (_, i) => ({
      id: String(i),
      title: `Scène ${i}`,
      parent: null,
      position: i,
      kind: 'scene',
      text: line.repeat(20),
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
      outline: {
        version: 1,
        nodes: Array.from({ length: 20 }, (_, j) => ({
          id: `${i}-${j}`,
          start: j * line.length,
          parent: j % 5 ? `${i}-${j - (j % 5)}` : null,
        })),
      },
    }));
    const data = compose(sections),
      mapping = sectionMapping(data.spans);
    const outline = outlineEditor(sections, data.spans, mapping.field);
    let state = EditorState.create({
      doc: data.text,
      extensions: [history(), mapping.extensions, outline.extensions],
    });
    const stats = (samples: number[]) => {
      samples.sort((a, b) => a - b);
      return {
        p50: samples[Math.floor(samples.length * 0.5)],
        p95: samples[Math.floor(samples.length * 0.95)],
      };
    };
    const edits: number[] = [],
      lookups: number[] = [],
      trees: number[] = [];
    for (let i = 0; i < 65; i++) {
      let start = performance.now();
      state = state.update({
        changes: { from: i % 2 ? state.doc.length - 1 : 1, insert: 'a' },
      }).state;
      const elapsed = performance.now() - start;
      start = performance.now();
      for (let j = 0; j < 100; j++)
        outline.entryAt(state, Math.floor((state.doc.length * j) / 100));
      const lookup = performance.now() - start;
      start = performance.now();
      expect(ordered(sections).length).toBe(sections.length);
      const tree = performance.now() - start;
      if (i >= 5) {
        edits.push(elapsed);
        lookups.push(lookup);
        trees.push(tree);
      }
    }
    expect(state.doc.length).toBe(data.text.length + 65);
    writeFileSync(
      process.env.ARIANE_PERF_REPORT!,
      JSON.stringify(
        {
          runtime: process.version,
          scenes: 2000,
          passages: 40000,
          characters: data.text.length,
          samples: edits.length,
          transactionMs: stats(edits),
          hundredLookupsMs: stats(lookups),
          treeMs: stats(trees),
        },
        null,
        2,
      ),
    );
  },
  120000,
);
