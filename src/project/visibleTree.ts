import type { Section } from '../contracts/project';
import { childrenByParent } from './tree';
export function visibleTree(sections: Section[], collapsed: ReadonlySet<string>) {
  const children = childrenByParent(sections);
  const stack = (children.get(null) ?? []).map((section) => ({ section, depth: 0 })).reverse();
  const rows: { section: Section; depth: number }[] = [],
    seen = new Set<string>();
  while (stack.length) {
    const row = stack.pop()!;
    if (seen.has(row.section.id)) continue;
    seen.add(row.section.id);
    rows.push(row);
    if (collapsed.has(row.section.id)) continue;
    const nested = children.get(row.section.id) ?? [];
    for (let i = nested.length - 1; i >= 0; i--)
      stack.push({ section: nested[i], depth: row.depth + 1 });
  }
  return rows;
}
