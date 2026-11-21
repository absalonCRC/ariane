import type { Section } from '../contracts/project';

export const blankMarker = '[…]';
export const writingAidLimit = 4000;

export function detachWritingAids(section: Section): Section {
  return {
    ...section,
    writingAids: (section.writingAids ?? []).map((aid) => ({ ...aid, from: null })),
  };
}

export function nextBlank(sections: Section[], sectionId: string | null, after: number) {
  let first: { section: string; from: number } | undefined;
  const current = sections.findIndex((section) => section.id === sectionId);
  for (const [index, section] of sections.entries()) {
    if (section.kind !== 'scene') continue;
    const from = section.text.indexOf(blankMarker);
    if (from === -1) continue;
    first ??= { section: section.id, from };
    if (index > current) return { section: section.id, from };
    if (index === current) {
      const following = section.text.indexOf(blankMarker, after);
      if (following !== -1) return { section: section.id, from: following };
    }
  }
  return first;
}
