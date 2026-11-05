import { useEffect, useRef } from 'react';
import type { Source } from '../contracts/sources';
import type { EntityBatch } from '../contracts/entities';
import type { MemoryResult } from '../contracts/memory';
import type { NoteActivityController } from './useNoteActivity';
export function useNoteObservations({
  path,
  activity,
  active,
  sources,
  card,
  reader,
  batches,
  result,
  node,
}: {
  path?: string;
  activity: NoteActivityController;
  active: string | null;
  sources: Source[];
  card: Source | null;
  reader: Source | null;
  batches: EntityBatch[];
  result: MemoryResult | null;
  node?: string | null;
}) {
  const { record } = activity;
  const previous = useRef(path);
  const switching = previous.current !== path;
  previous.current = path;
  const detections = JSON.stringify(
    batches.flatMap((batch) =>
      batch.mentions.map((mention) => {
        const paragraph =
          [...(batch.outline?.nodes ?? [])].reverse().find((node) => node.start <= mention.from)
            ?.id ?? '';
        return {
          kind: 'detected' as const,
          title: mention.title,
          section: batch.section,
          sourceId: mention.sourceId,
          entityId: mention.entityId,
          dedupKey: JSON.stringify([
            'detected',
            batch.section,
            paragraph,
            mention.sourceId ?? mention.entityId ?? mention.title,
          ]),
        };
      }),
    ),
  );
  useEffect(() => {
    if (switching) return;
    for (const event of JSON.parse(detections)) void record(event);
  }, [record, detections]);
  const suggestions = JSON.stringify([
    ...sources.map((source) => ({
      kind: 'suggested' as const,
      title: source.title,
      sourceId: source.id,
      section: active,
      dedupKey: `suggested:${active}:${node}:${source.id}`,
    })),
    ...(result?.evidence
      ? [
          {
            kind: 'suggested' as const,
            title: result.evidence.title,
            sourceId: result.evidence.sourceId,
            section: active,
            dedupKey: `evidence:${active}:${result.anchorHash}:${result.evidence.id}`,
          },
        ]
      : []),
    ...(result?.entities.map((entity) => ({
      kind: 'suggested' as const,
      title: entity.title,
      entityId: entity.id,
      section: active,
      dedupKey: `entity-suggestion:${active}:${node}:${entity.id}`,
    })) ?? []),
  ]);
  useEffect(() => {
    if (switching) return;
    for (const event of JSON.parse(suggestions)) void record(event);
  }, [record, suggestions]);
  useEffect(() => {
    if (switching) return;
    if (card)
      void record({ kind: 'opened', title: card.title, sourceId: card.id, section: active });
  }, [record, card?.id]);
  useEffect(() => {
    if (switching) return;
    if (reader)
      void record({ kind: 'consulted', title: reader.title, sourceId: reader.id, section: active });
  }, [record, reader?.id, reader?.page]);
}
