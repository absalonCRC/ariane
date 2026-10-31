export interface LanguageIssue {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
}
export interface ReviewSuggestion {
  from: number;
  to: number;
  original: string;
  replacement: string;
  message: string;
  source: 'language' | 'model';
}
export interface Range {
  from: number;
  to: number;
}

// Protect Markdown links, wikilinks, URLs, HTML, and code as indivisible ranges.
export function protectedRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const patterns = [
    /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/gu,
    /`+[^`\n]*`+/gu,
    /!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^\n)]*\)/gu,
    /https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[\w-]+/gu,
    /<[^>\n]+>/gu,
    /\\[^\n]|[*_~#\[\]`|>]/gu,
  ];
  for (const pattern of patterns)
    for (const match of text.matchAll(pattern))
      ranges.push({ from: match.index!, to: match.index! + match[0].length });
  return ranges;
}
function overlaps(from: number, to: number, ranges: Range[]) {
  return ranges.some((range) => from < range.to && to > range.from);
}
function distance(a: string, b: string) {
  const first = Array.from(a.toLocaleLowerCase().normalize('NFC'));
  const second = Array.from(b.toLocaleLowerCase().normalize('NFC'));
  let previous = Array.from({ length: second.length + 1 }, (_, i) => i);
  for (let i = 0; i < first.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < second.length; j++)
      next.push(
        Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + (first[i] === second[j] ? 0 : 1)),
      );
    previous = next;
  }
  return previous[second.length];
}
export function reviewSuggestions(
  text: string,
  issues: LanguageIssue[],
  output: string | null,
  extraRanges: Range[] = [],
) {
  const ranges = [...protectedRanges(text), ...extraRanges];
  const suggestions: ReviewSuggestion[] = [];
  for (const issue of issues) {
    const from = issue.offset;
    const to = from + issue.length;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to > text.length ||
      from >= to ||
      overlaps(from, to, ranges)
    )
      continue;
    const original = text.slice(from, to);
    for (const replacement of issue.replacements.slice(0, 3)) {
      if (!replacement || replacement === original || /[\n\r`*_[\]<>]/u.test(replacement)) continue;
      suggestions.push({
        from,
        to,
        original,
        replacement,
        message: issue.message,
        source: 'language',
      });
    }
  }
  if (output && output !== text) {
    const tokens = (value: string) => [...value.matchAll(/[\p{L}\p{M}]+/gu)];
    const before = tokens(text);
    const after = tokens(output);
    const skeleton = (value: string) => value.replace(/[\p{L}\p{M}]+/gu, '\u0000');
    // Reject all AI output when token count, punctuation, whitespace, markup, or digits differ.
    if (before.length === after.length && skeleton(text) === skeleton(output)) {
      const unsafe = before.some((match, i) => {
        const replacement = after[i][0];
        if (match[0] === replacement) return false;
        const from = match.index!,
          to = from + match[0].length;
        return (
          overlaps(from, to, ranges) ||
          /^\p{Lu}/u.test(match[0]) ||
          distance(match[0], replacement) > 2
        );
      });
      if (unsafe) return suggestions;
      for (let i = 0; i < before.length; i++) {
        const old = before[i][0],
          replacement = after[i][0],
          from = before[i].index!,
          to = from + old.length;
        if (old === replacement) continue;
        suggestions.push({
          from,
          to,
          original: old,
          replacement,
          message: 'Suggestion locale',
          source: 'model',
        });
      }
    }
  }
  return suggestions.filter(
    (item, i, all) =>
      all.findIndex(
        (x) => x.from === item.from && x.to === item.to && x.replacement === item.replacement,
      ) === i,
  );
}
