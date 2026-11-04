import type { Source } from '../app/types';

export interface MarginGroup {
  id: number | string;
  top: number;
  sources: Source[];
}

// Preserve passage anchors, then reserve the actual expanded card height.
export function marginLayout(
  groups: MarginGroup[],
  openGroup: number | string | null,
  expandedId: string | undefined,
  expandedHeight: number,
) {
  let bottom = -Infinity;
  return groups.map((group) => {
    const count = openGroup === group.id ? group.sources.length : Math.min(2, group.sources.length);
    const visible = group.sources.slice(0, count);
    const expanded = visible.some((source) => source.id === expandedId);
    const height =
      count * 54 +
      (expanded ? Math.max(0, expandedHeight - 54) : 0) +
      (group.sources.length > 2 ? 24 : 0);
    const top = Math.max(group.top, bottom);
    bottom = top + height + 12;
    return { ...group, top, height };
  });
}
