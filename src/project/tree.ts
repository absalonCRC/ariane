import type { Section } from '../contracts/project';
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
  return all.filter(
    (s) => s.kind === 'scene' && !s.trashed && (!continuous || s.included !== false),
  );
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

export function hasChapterAncestor(sections: Section[], parent: string | null): boolean {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const current = byId.get(parent);
    if (current?.kind === 'chapter') return true;
    parent = current?.parent ?? null;
  }
  return false;
}

export function canMoveToParent(
  sections: Section[],
  ids: string[],
  parent: string | null,
): boolean {
  const branch = ids.flatMap((id) => descendants(sections, id));
  if (
    parent &&
    (!sections.some((s) => s.id === parent && s.kind !== 'scene' && !s.trashed) ||
      branch.some((s) => s.id === parent))
  )
    return false;
  return !branch.some((s) => s.kind === 'chapter') || !hasChapterAncestor(sections, parent);
}

export function manuscriptSections(sections: Section[]): Section[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const included = new Set<string>();
  for (const s of sections) {
    if (s.kind !== 'scene' || s.trashed || s.included === false) continue;
    let node: Section | undefined = s;
    while (node && !included.has(node.id)) {
      included.add(node.id);
      node = node.parent ? byId.get(node.parent) : undefined;
    }
  }
  return ordered(sections).filter((s) => included.has(s.id) && !s.trashed);
}
