export interface TextMatch {
  from: number;
  to: number;
}
export interface NormalizedText {
  value: string;
  starts: Uint32Array;
  ends: Uint32Array;
}

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

export const normalizedTerm = (query: string) => fold(query.trim());

// Keep offsets into the untouched manuscript, including combining marks and ligatures.
// Manuscript search retains this value per section until that section's text changes.
export function normalizeText(text: string): NormalizedText {
  let value = '';
  let starts = new Uint32Array(Math.max(16, text.length));
  let ends = new Uint32Array(starts.length);
  let length = 0;
  for (const cluster of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const code = cluster[0].charCodeAt(0);
    const part =
      cluster[0].length === 1 && code < 128
        ? code >= 65 && code <= 90
          ? String.fromCharCode(code + 32)
          : cluster[0]
        : fold(cluster[0]);
    value += part;
    if (length + part.length > starts.length) {
      const capacity = Math.max(starts.length * 2, length + part.length);
      const nextStarts = new Uint32Array(capacity),
        nextEnds = new Uint32Array(capacity);
      nextStarts.set(starts);
      nextEnds.set(ends);
      starts = nextStarts;
      ends = nextEnds;
    }
    for (let i = 0; i < part.length; i++) {
      starts[length] = cluster.index;
      ends[length++] = cluster.index + cluster[0].length;
    }
  }
  starts = starts.subarray(0, length);
  ends = ends.subarray(0, length);
  return { value, starts, ends };
}

/** Visit without allocating an array of every occurrence. The term is already folded. */
export function visitNormalizedMatches(
  source: NormalizedText,
  term: string,
  visit?: (from: number, to: number) => void,
  limit = Infinity,
): number {
  if (!term || limit <= 0) return 0;
  let cursor = 0,
    previousEnd = -1,
    count = 0,
    index: number;
  while ((index = source.value.indexOf(term, cursor)) >= 0) {
    const from = source.starts[index],
      to = source.ends[index + term.length - 1];
    if (previousEnd <= from) {
      count++;
      visit?.(from, to);
      previousEnd = to;
      if (count >= limit) break;
    }
    cursor = index + term.length;
  }
  return count;
}

export function normalizedMatches(text: string, query: string, limit = Infinity): TextMatch[] {
  const matches: TextMatch[] = [],
    term = normalizedTerm(query);
  if (term)
    visitNormalizedMatches(
      normalizeText(text),
      term,
      (from, to) => matches.push({ from, to }),
      limit,
    );
  return matches;
}
