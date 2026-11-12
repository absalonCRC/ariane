import type { Project } from '../contracts/project';
import type { StructuredQuery } from '../contracts/structuredQuery';
import type { EntityCatalog } from '../contracts/entityIdentity';
import type { EntityBatch } from '../contracts/entities';
import type { Source } from '../contracts/sources';
import { taggedPassages, type TagPassage } from '../tags/passages';
import { initialOutline, validOutline } from '../editor/outline/model';
import { identityOccurrences } from '../entities/occurrences';
import { canonicalEntity } from '../entities/model';
export function evaluateQuery(
  project: Project,
  query: StructuredQuery,
  catalog: EntityCatalog,
  batches: EntityBatch[],
  sources: Source[],
): { passages: TagPassage[]; ambiguous: number; pending: number } {
  if (query.version !== 1 || !query.groups.length || query.groups.some((g) => !g.length))
    throw Error('Vue enregistrée invalide ou trop récente.');
  const result = new Map<string, TagPassage>();
  let ambiguous = 0;
  for (const group of query.groups) {
    let matches: Map<string, TagPassage> | null = null;
    for (const term of group) {
      let passages: TagPassage[] = [];
      if (term.kind === 'tag') {
        if (!project.smartTags?.some((t) => t.id === term.id))
          throw Error('Une référence de cette vue est introuvable.');
        passages = taggedPassages(project, term.id);
      } else if (term.kind === 'entity') {
        const entity = canonicalEntity(catalog, term.id);
        if (!entity) throw Error('Une référence de cette vue est introuvable.');
        for (const hit of identityOccurrences(project, catalog, entity, batches, sources)) {
          if (hit.ambiguous) {
            ambiguous++;
            continue;
          }
          const section = project.sections.find((s) => s.id === hit.section)!;
          const saved = validOutline(section.text, section.outline),
            outline = initialOutline(section.text, saved ? section.outline : null);
          let i = outline.nodes.length - 1;
          while (i >= 0 && outline.nodes[i].start > hit.from) i--;
          const node = outline.nodes[i];
          if (node)
            passages.push({
              section: section.id,
              title: section.title,
              node: saved ? node.id : null,
              from: node.start,
              text: section.text.slice(
                node.start,
                outline.nodes[i + 1] ? outline.nodes[i + 1].start - 1 : section.text.length,
              ),
              inherited: false,
            });
        }
      } else throw Error('Référence de recherche invalide.');
      const map = new Map(passages.map((p) => [p.section + ':' + p.from, p]));
      if (matches === null) matches = map;
      else {
        const previous: Map<string, TagPassage> = matches;
        matches = new Map(Array.from(previous.entries()).filter((entry) => map.has(entry[0])));
      }
    }
    for (const [key, p] of matches ?? []) result.set(key, p);
  }
  const order = new Map(project.sections.map((s, i) => [s.id, i]));
  return {
    passages: [...result.values()].sort(
      (a, b) => order.get(a.section)! - order.get(b.section)! || a.from - b.from,
    ),
    ambiguous,
    pending: query.groups.some((g) => g.some((t) => t.kind === 'entity'))
      ? project.sections.filter(
          (s) =>
            s.kind === 'scene' &&
            !s.trashed &&
            s.text.trim() &&
            !batches.some((b) => b.section === s.id && b.text === s.text && b.analyzed),
        ).length
      : 0,
  };
}
