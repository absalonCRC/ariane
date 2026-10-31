import type { Section } from '../app/types';
export function childrenByParent(sections: Section[]): Map<string | null, Section[]> {
  const children = new Map<string | null, Section[]>();
  for (const section of sections) {
    const siblings = children.get(section.parent);
    if (siblings) siblings.push(section);
    else children.set(section.parent, [section]);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
  return children;
}
export function ordered(sections: Section[], parent: string | null = null): Section[] {
  const children = childrenByParent(sections);
  const result: Section[] = [],
    seen = new Set<string>();
  const stack = [...(children.get(parent) ?? [])].reverse();
  while (stack.length) {
    const section = stack.pop()!;
    if (seen.has(section.id)) continue;
    seen.add(section.id);
    result.push(section);
    const nested = children.get(section.id) ?? [];
    for (let i = nested.length - 1; i >= 0; i--) stack.push(nested[i]);
  }
  return result;
}
export function descendants(sections: Section[], id: string): Section[] {
  const s = sections.find((s) => s.id === id);
  return s ? [s, ...ordered(sections, id)] : [];
}
export function scenesFor(
  sections: Section[],
  active: string | null,
  continuous: boolean,
): Section[] {
  const all = continuous || !active ? ordered(sections) : descendants(sections, active);
  return all.filter((s) => s.kind === 'scene');
}
export function sectionPath(sections: Section[], selected: Section | undefined): Section[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const path: Section[] = [];
  let current = selected;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return path;
}
