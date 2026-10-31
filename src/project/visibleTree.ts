import type { Section } from '../app/types';
export function visibleTree(sections: Section[], collapsed: ReadonlySet<string>) {
  const children = new Map<string | null, Section[]>();
  for (const section of sections) {
    const siblings = children.get(section.parent);
    if (siblings) siblings.push(section);
    else children.set(section.parent, [section]);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
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
