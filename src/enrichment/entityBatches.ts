import { ChangeSet } from '@codemirror/state';
import { diffChars } from 'diff';
import type { Section } from '../app/types';
import type { EntityBatch } from './entityTypes';
import { passages } from './passages';

/** Retain literal names through context edits, including within their own block. */
export function rebaseEntities(batch: EntityBatch, section: Section): EntityBatch {
  if (batch.text === section.text) return { ...batch, revision: section.revision };
  const old = passages({ ...section, text: batch.text, outline: batch.outline });
  const current = new Map(passages(section).map((p) => [p.node, p]));
  return {
    section: section.id,
    text: section.text,
    revision: section.revision,
    outline: section.outline,
    mentions: old.flatMap((block) => {
      const next = current.get(block.node);
      if (!next) return [];
      let offset = 0;
      const edits: { from: number; to?: number; insert?: string }[] = [];
      for (const part of diffChars(block.text, next.text)) {
        if (part.added) edits.push({ from: offset, insert: part.value });
        else {
          if (part.removed) edits.push({ from: offset, to: offset + part.value.length });
          offset += part.value.length;
        }
      }
      const changes = ChangeSet.of(edits, block.text.length);
      return batch.mentions
        .filter((m) => m.from >= block.from && m.to <= block.to)
        .flatMap((m) => {
          const from = changes.mapPos(m.from - block.from, 1);
          const to = changes.mapPos(m.to - block.from, -1);
          const name = batch.text.slice(m.from, m.to);
          if (from >= to || next.text.slice(from, to) !== name) return [];
          const word = /[\p{L}\p{N}_]/u;
          if (
            (from > 0 &&
              word.test(next.text[from - 1]) &&
              !word.test(block.text[m.from - block.from - 1] ?? '')) ||
            (to < next.text.length &&
              word.test(next.text[to]) &&
              !word.test(block.text[m.to - block.from] ?? ''))
          )
            return [];
          return [{ ...m, from: from + next.from, to: to + next.from }];
        });
    }),
  };
}
