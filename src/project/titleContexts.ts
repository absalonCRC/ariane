import type { Section } from '../contracts/project';

export function titleContexts(
  sections: Pick<Section, 'id' | 'title' | 'parent'>[],
  root: string,
  untitled: string,
) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const groups = new Map<string, typeof sections>();
  for (const section of sections) {
    const key = (section.title.trim() || untitled).normalize('NFC').toLocaleLowerCase();
    const group = groups.get(key);
    if (group) group.push(section);
    else groups.set(key, [section]);
  }
  const contexts = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const counts = new Map<string, number>();
    const paths = group.map((s) => {
      const parts: string[] = [];
      const seen = new Set([s.id]);
      let parent = s.parent ? byId.get(s.parent) : undefined;
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        parts.unshift(parent.title.trim() || untitled);
        parent = parent.parent ? byId.get(parent.parent) : undefined;
      }
      parts.unshift(root);
      const suffixes = parts.map((_, i) => parts.slice(i).join(' › ')).reverse();
      for (const suffix of suffixes) counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
      return suffixes;
    });
    const ordinals = new Map<string, number>();
    group.forEach((s, i) => {
      let context = paths[i].find((path) => counts.get(path) === 1);
      if (!context) {
        const full = paths[i][paths[i].length - 1];
        const ordinal = (ordinals.get(full) ?? 0) + 1;
        ordinals.set(full, ordinal);
        context = full + ' · ' + ordinal;
      }
      contexts.set(s.id, context);
    });
  }
  return contexts;
}
