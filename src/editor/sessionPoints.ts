import type { WritingPoint } from '../contracts/writingSession';
import type { Span } from './composite';
import type { OutlineEntry } from './outline/state';

export function pointAt(
  pos: number,
  spans: readonly Span[],
  nodes: readonly OutlineEntry[],
  branch?: string,
): WritingPoint | null {
  let i = spans.length - 1;
  while (i >= 0 && spans[i].from > pos) i--;
  const span = spans[i];
  if (!span) return null;
  let low = 0,
    high = nodes.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (nodes[mid].from <= pos) low = mid + 1;
    else high = mid;
  }
  const node = nodes[low - 1]?.section === span.id ? nodes[low - 1] : undefined;
  return {
    section: span.id,
    node: node?.id ?? null,
    offset: pos - (node?.from ?? span.from),
    position: pos - span.from,
    branch,
  };
}

export function positionOf(
  point: WritingPoint,
  spans: readonly Span[],
  nodes: readonly OutlineEntry[],
  requireNode = false,
) {
  const span = spans.find((s) => s.id === point.section);
  if (!span) return null;
  const index = nodes.findIndex((n) => n.section === span.id && n.id === point.node);
  if (index < 0 && requireNode && point.node) return null;
  const limit = index >= 0 ? Math.min(span.to, nodes[index + 1]?.from ?? span.to) : span.to;
  const pos = index >= 0 ? nodes[index].from + point.offset : span.from + point.position;
  return Number.isFinite(pos) ? Math.min(limit, Math.max(span.from, pos)) : span.from;
}
