import type { Project } from '../contracts/project';
import type { StructuredQuery } from '../contracts/structuredQuery';
import type { EntityCatalog } from '../contracts/entityIdentity';
import type { EntityBatch } from '../contracts/entities';
import type { Source } from '../contracts/sources';
import { passageAtIndex, passageOutline, taggedPassages, type TagPassage } from '../tags/passages';
import { identityOccurrences } from '../entities/occurrences';
import { canonicalEntity } from '../entities/model';
function passageIndex(nodes: ReturnType<typeof passageOutline>['nodes'], offset: number) {
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (nodes[middle].start <= offset) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

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
  const order = new Map(project.sections.map((s, i) => [s.id, i]));
  // A search sees the current drafts. Reuse outlines only within this evaluation.
  const outlines = new Map<string, ReturnType<typeof passageOutline>>();
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
          const section = project.sections[order.get(hit.section)!];
          let outline = outlines.get(section.id);
          if (!outline) {
            outline = passageOutline(section);
            outlines.set(section.id, outline);
          }
          const index = passageIndex(outline.nodes, hit.from);
          if (index >= 0) passages.push(passageAtIndex(section, outline, index, false));
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
