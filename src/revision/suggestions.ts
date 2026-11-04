import { diffWordsWithSpace } from 'diff';
import { t } from '../i18n';
export interface LanguageIssue {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
  spelling?: boolean;
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
// Shared by grammatical and model suggestions in the supported writing languages.
const negativeWord =
  /^(?:ne|n|pas|jamais|plus|sans|ni|aucun|aucune|non|rien|personne|no|not|never|neither|nor|without|nobody|nothing|none|nunca|jamás|nadie|nada|ninguno|ninguna|ningunos|ningunas|sin|kein|keine|keinen|keinem|keiner|keines|nicht|nie|niemals|niemand|nichts|ohne|weder|mai|nessuno|nessuna|nessun|né|senza|niente|nulla)$/iu;
function negatives(text: string) {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu) ?? []).filter(
    (word) => negativeWord.test(word) || /n['’]t$/iu.test(word) || /^n['’]/iu.test(word),
  );
}
function preservesLiterals(original: string, replacement: string) {
  const numbers = (text: string) => text.match(/\p{N}+(?:[.,]\p{N}+)*/gu) ?? [];
  const plural = /^(les|des|ces|mes|tes|ses|nos|vos|leurs|plusieurs)\b/iu.exec(original)?.[1];
  return (
    JSON.stringify(numbers(original)) === JSON.stringify(numbers(replacement)) &&
    JSON.stringify(negatives(original)) === JSON.stringify(negatives(replacement)) &&
    (!plural || replacement.toLocaleLowerCase().startsWith(`${plural.toLocaleLowerCase()} `))
  );
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
    if (issue.spelling && /\p{Lu}/u.test(original)) continue;
    for (const replacement of issue.replacements.slice(0, 3)) {
      if (!replacement || replacement === original || /[\n\r`*_[\]<>]/u.test(replacement)) continue;
      if (!preservesLiterals(original, replacement)) continue;
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
  if (output && output !== text && output.length < text.length * 2 + 200) {
    const changes = diffWordsWithSpace(text, output);
    let offset = 0;
    for (let i = 0; i < changes.length; i++) {
      const part = changes[i];
      if (part.added) continue;
      if (!part.removed) {
        offset += part.value.length;
        continue;
      }
      const from = offset;
      offset += part.value.length;
      const next = changes[i + 1];
      if (!next?.added) continue;
      const before = [...part.value.matchAll(/[\p{L}\p{M}]+/gu)];
      const after = [...next.value.matchAll(/[\p{L}\p{M}]+/gu)];
      // Deletions, insertions and restructuring need a different kind of review.
      if (!before.length || before.length !== after.length) continue;
      if (!preservesLiterals(part.value, next.value)) continue;
      const safe = before.every((word, j) => {
        const replacement = after[j][0];
        if (word[0] === replacement) return true;
        const start = from + word.index!;
        return (
          !overlaps(start, start + word[0].length, ranges) &&
          !/^\p{Lu}/u.test(word[0]) &&
          !negativeWord.test(word[0]) &&
          !negativeWord.test(replacement) &&
          distance(word[0], replacement) <= 2
        );
      });
      if (!safe) continue;
      for (let j = 0; j < before.length; j++) {
        const word = before[j],
          replacement = after[j][0];
        if (word[0] === replacement) continue;
        suggestions.push({
          from: from + word.index!,
          to: from + word.index! + word[0].length,
          original: word[0],
          replacement,
          message: t('Suggestion locale'),
          source: 'model',
        });
      }
    }
  }
  const effects = new Set<string>();
  return suggestions.filter((item) => {
    const effect = text.slice(0, item.from) + item.replacement + text.slice(item.to);
    if (effects.has(effect)) return false;
    effects.add(effect);
    return true;
  });
}
