import type { EntityCatalog, EntityIdentity } from '../contracts/entityIdentity';
import type { Project } from '../contracts/project';
import type { EntityBatch } from '../contracts/entities';
import type { Source } from '../contracts/sources';
import { sourceOccurrences } from '../sources/occurrences';
import { canonicalEntity } from './model';
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function identityOccurrences(
  project: Project,
  catalog: EntityCatalog,
  entity: EntityIdentity,
  batches: EntityBatch[],
  sources: Source[],
) {
  const synthetic: Source = {
    id: entity.id,
    vaultId: '',
    path: '',
    title: entity.title,
    kind: entity.kind,
    aliases: entity.aliases,
    text: '',
    fields: {},
    tags: [],
    page: null,
    matched: null,
    score: 0,
    fingerprint: '',
  };
  const names = new Set([entity.title, ...entity.aliases].map(fold));
  const homonyms = catalog.entities.filter(
    (e) =>
      !e.redirect && e.id !== entity.id && [e.title, ...e.aliases].some((n) => names.has(fold(n))),
  );
  const assigned = (source: string | null, detected: string | null) => {
    const owners = catalog.entities.filter(
      (e) =>
        !e.redirect &&
        ((source && e.sourceIds.includes(source)) ||
          (!source && detected && e.detectedIds.includes(detected))),
    );
    return owners.length === 1 ? canonicalEntity(catalog, owners[0].id) : undefined;
  };
  const live = batches.filter((b) =>
    project.sections.some((s) => s.id === b.section && !s.trashed && s.text === b.text),
  );
  const results = sourceOccurrences(project.sections, synthetic).flatMap((hit) => {
    if (hit.from === null || hit.to === null) return [];
    const from = hit.from,
      to = hit.to,
      section = project.sections.find((s) => s.id === hit.section)!;
    const batch = live.find((b) => b.section === hit.section),
      mention = batch?.mentions.find((m) => m.from === from && m.to === to);
    const resolved = mention ? assigned(mention.sourceId, mention.entityId) : undefined;
    if (resolved && resolved.id !== entity.id) return [];
    const matchingSources = sources.filter((s) =>
      [s.title, ...s.aliases].some((n) => fold(n) === fold(hit.matched)),
    );
    const ambiguous =
      !resolved &&
      (homonyms.some((e) => [e.title, ...e.aliases].some((n) => fold(n) === fold(hit.matched))) ||
        matchingSources.length > 1);
    return [
      {
        ...hit,
        from,
        to,
        node:
          [...(section.outline?.nodes ?? [])].reverse().find((n) => n.start <= from)?.id ?? null,
        ambiguous,
      },
    ];
  });
  for (const batch of live) {
    const section = project.sections.find((s) => s.id === batch.section)!;
    for (const mention of batch.mentions) {
      if (
        assigned(mention.sourceId, mention.entityId)?.id !== entity.id ||
        mention.from < 0 ||
        mention.to > batch.text.length ||
        mention.to <= mention.from
      )
        continue;
      const from = mention.from,
        to = mention.to;
      const hit = {
        key: section.id + ':' + from,
        section: section.id,
        title: section.title,
        from,
        to,
        matched: batch.text.slice(from, to),
        kind: 'mention' as const,
        excerpt: batch.text.slice(Math.max(0, from - 55), to + 90),
        node:
          [...(section.outline?.nodes ?? [])].reverse().find((n) => n.start <= from)?.id ?? null,
        ambiguous: false,
      };
      const i = results.findIndex((r) => r.key === hit.key);
      if (i < 0) results.push(hit);
      else results[i] = hit;
    }
  }
  for (const source of sources.filter((s) => entity.sourceIds.includes(s.id))) {
    for (const hit of sourceOccurrences(project.sections, source).filter(
      (h) => h.kind === 'reference',
    )) {
      if (hit.from === null || hit.to === null || results.some((r) => r.key === hit.key)) continue;
      const section = project.sections.find((s) => s.id === hit.section)!;
      results.push({
        ...hit,
        from: hit.from,
        to: hit.to,
        node:
          [...(section.outline?.nodes ?? [])].reverse().find((n) => n.start <= hit.from!)?.id ??
          null,
        ambiguous: false,
      });
    }
  }
  return results.sort(
    (a, b) =>
      project.sections.findIndex((s) => s.id === a.section) -
        project.sections.findIndex((s) => s.id === b.section) || a.from - b.from,
  );
}
