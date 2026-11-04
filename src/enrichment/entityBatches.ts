import type { Section } from '../app/types';
import type { EntityBatch } from './entityTypes';
import { passages } from './passages';

/** Keep only unchanged logical blocks, mapping their offsets into the live text. */
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
      if (!next || next.signature !== block.signature) return [];
      return batch.mentions
        .filter((m) => m.from >= block.from && m.to <= block.to)
        .map((m) => ({
          ...m,
          from: m.from + next.from - block.from,
          to: m.to + next.from - block.from,
        }));
    }),
  };
}
