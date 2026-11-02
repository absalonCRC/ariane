export interface TextMatch { from: number; to: number }

// Search a folded copy, but always return offsets into the untouched manuscript.
function folded(text: string) {
  let value = '';
  const starts: number[] = [], ends: number[] = [];
  for (const cluster of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const part = cluster[0].normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
      .replace(/[’‘ʼ]/g, "'").replace(/[\u00a0\u202f]/g, ' ').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
    value += part;
    for (let i = 0; i < part.length; i++) {
      starts.push(cluster.index);
      ends.push(cluster.index + cluster[0].length);
    }
  }
  return { value, starts, ends };
}
export function normalizedMatches(text: string, query: string): TextMatch[] {
  const term = folded(query.trim()).value;
  if (!term) return [];
  const source = folded(text), matches: TextMatch[] = [];
  let cursor = 0, index: number;
  while ((index = source.value.indexOf(term, cursor)) >= 0) {
    const from = source.starts[index], to = source.ends[index + term.length - 1];
    if (!matches.length || matches[matches.length - 1].to <= from) matches.push({ from, to });
    cursor = index + term.length;
  }
  return matches;
}
