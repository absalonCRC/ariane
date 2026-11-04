import type { Section } from '../app/types';

export interface Passage {
  section: string;
  node: string | null;
  from: number;
  to: number;
  text: string;
  signature: string;
}
export const passageKey = (p: Pick<Passage, 'section' | 'node'>) =>
  `${p.section}\u001f${p.node ?? ''}`;

export function passages(section: Section, offset = 0): Passage[] {
  const text = section.text;
  const nodes = section.outline?.nodes;
  return (nodes?.length ? nodes : [{ id: null, parent: null, start: 0 }]).map((n, i) => {
    const to = nodes?.[i + 1]?.start ?? text.length;
    const body = text.slice(n.start, to);
    return {
      section: section.id,
      node: n.id,
      from: offset + n.start,
      to: offset + to,
      text: body,
      signature: JSON.stringify([body, section.title, n.parent]),
    };
  });
}

export function visiblePassages(
  sections: Section[],
  visible: { from: number; text: string } | null,
) {
  const result: Passage[] = [];
  let offset = 0;
  for (const [i, section] of sections.entries()) {
    const end = offset + section.text.length;
    if (!visible || (end >= visible.from && offset <= visible.from + visible.text.length)) {
      result.push(
        ...passages(section, offset).filter(
          (p) => !visible || (p.to >= visible.from && p.from <= visible.from + visible.text.length),
        ),
      );
    }
    offset = end + (i < sections.length - 1 && !section.text.endsWith('\n\n') ? 2 : 0);
    if (visible && offset > visible.from + visible.text.length) break;
  }
  return result;
}
