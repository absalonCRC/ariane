import { validOutline } from '../editor/outline/model';
import type { MergeEntry, Section } from '../app/types';

const normalized = (section: Section | null) =>
  section && {
    ...section,
    revision: 0,
    outline: section.outline ?? null,
    role: section.role ?? 'manuscript',
    included: section.included !== false,
    trashed: !!section.trashed,
  };
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) =>
    equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
};
export function mergeParagraphs(base: string, current: string, incoming: string): string | null {
  const original = base.split('\n\n');
  const edit = (text: string) => {
    const value = text.split('\n\n');
    let start = 0,
      tail = 0;
    while (start < original.length && start < value.length && original[start] === value[start])
      start++;
    while (
      tail < original.length - start &&
      tail < value.length - start &&
      original.at(-1 - tail) === value.at(-1 - tail)
    )
      tail++;
    return { start, end: original.length - tail, value: value.slice(start, value.length - tail) };
  };
  const a = edit(current),
    b = edit(incoming);
  if (a.start === b.start || (a.start < b.end && b.start < a.end)) return null;
  const [first, last] = a.start < b.start ? [a, b] : [b, a];
  original.splice(last.start, last.end - last.start, ...last.value);
  original.splice(first.start, first.end - first.start, ...first.value);
  return original.join('\n\n');
}
export function mergeSections(
  base: Section[],
  current: Section[],
  incoming: Section[],
): MergeEntry[] {
  const ids = [...new Set([...base, ...current, ...incoming].map((s) => s.id))].sort();
  return ids.map((id) => {
    const b = base.find((s) => s.id === id) ?? null,
      a = current.find((s) => s.id === id) ?? null,
      z = incoming.find((s) => s.id === id) ?? null;
    const bn = normalized(b),
      an = normalized(a),
      zn = normalized(z);
    const fields: string[] = [];
    let result = a;
    if (equal(an, zn) || equal(bn, zn)) result = a;
    else if (equal(bn, an)) result = z;
    else if (an && zn && an.trashed !== zn.trashed) fields.push('section');
    else if (bn && an && zn) {
      const r = { ...an } as Record<string, unknown>;
      for (const key of Object.keys(an) as (keyof typeof an)[]) {
        if (key === 'revision' || equal(an[key], zn[key]) || equal(bn[key], zn[key])) continue;
        if (equal(bn[key], an[key])) r[key] = zn[key];
        else if (key === 'text') {
          const merged = mergeParagraphs(bn.text, an.text, zn.text);
          if (merged === null) fields.push(key);
          else r.text = merged;
        } else fields.push(key);
      }
      if (r.text !== an.text && r.text !== zn.text) r.outline = null;
      result = r as unknown as Section;
      if (
        result.outline &&
        !validOutline(result.text, result.outline) &&
        !fields.includes('outline')
      )
        fields.push('outline');
    } else fields.push('section');
    return {
      id,
      title: (result ?? a ?? z ?? b)!.title,
      base: b,
      current: a,
      incoming: z,
      result,
      changed: !equal(an, normalized(result)) || fields.length > 0,
      conflict: fields.length > 0,
      fields,
    };
  });
}
export function validateMergedSections(sections: Section[]) {
  const all = new Map(sections.map((s) => [s.id, s]));
  if (all.size !== sections.length) throw new Error('Identifiants de sections en double.');
  for (const section of sections) {
    const seen = new Set([section.id]);
    let parent = section.parent;
    while (parent) {
      if (seen.has(parent) || !all.has(parent))
        throw new Error(
          'Cette intégration crée une arborescence incompatible. Revoyez les déplacements et suppressions.',
        );
      seen.add(parent);
      parent = all.get(parent)!.parent;
    }
  }
}
