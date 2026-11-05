import type { Section } from '../contracts/project';
import { childrenByParent } from './tree';
export type Inclusion = { total: number; included: number };
export function inclusionBySection(sections: Section[]): Map<string, Inclusion> {
  const children = childrenByParent(sections.filter((s) => !s.trashed));
  const counts = new Map<string, Inclusion>();
  const visiting = new Set<string>();
  function count(s: Section): Inclusion {
    const existing = counts.get(s.id);
    if (existing) return existing;
    if (visiting.has(s.id)) return { total: 0, included: 0 };
    visiting.add(s.id);
    const value =
      s.kind === 'scene'
        ? { total: 1, included: Number(s.included !== false) }
        : { total: 0, included: 0 };
    for (const child of children.get(s.id) ?? []) {
      const nested = count(child);
      value.total += nested.total;
      value.included += nested.included;
    }
    visiting.delete(s.id);
    counts.set(s.id, value);
    return value;
  }
  for (const s of sections) if (!s.trashed) count(s);
  return counts;
}

// Continuations come from the entire visible tree, so virtualized rows keep their guides.
export function branchGuides(rows: { section: Section; depth: number }[]) {
  const last = new Map<string | null, string>();
  for (const { section } of rows) last.set(section.parent, section.id);
  const ancestorContinues: boolean[] = [];
  return rows.map(({ section, depth }, index) => {
    const isLast = last.get(section.parent) === section.id;
    const guides = ancestorContinues.slice(1, depth);
    ancestorContinues.length = depth;
    ancestorContinues[depth] = !isLast;
    return { guides, isLast, hasChildren: (rows[index + 1]?.depth ?? 0) > depth };
  });
}
