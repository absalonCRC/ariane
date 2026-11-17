import type { ChangeSet, Text } from '@codemirror/state';

/** Count changed complete lines, including boundary words, without scanning the manuscript. */
export function writingWordDelta(before: Text, after: Text, changes: ChangeSet): number {
  const oldRanges: [number, number][] = [],
    newRanges: [number, number][] = [];
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    oldRanges.push([before.lineAt(fromA).from, before.lineAt(toA).to]);
    newRanges.push([after.lineAt(fromB).from, after.lineAt(toB).to]);
  });
  const count = (text: Text, ranges: [number, number][]) => {
    const merged: [number, number][] = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
      else merged.push([...range]);
    }
    return merged.reduce(
      (total, [from, to]) => total + (text.sliceString(from, to).match(/\S+/gu)?.length ?? 0),
      0,
    );
  };
  return count(after, newRanges) - count(before, oldRanges);
}
