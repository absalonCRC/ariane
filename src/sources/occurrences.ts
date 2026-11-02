import { t } from '../i18n';
import type { Section, Source } from '../app/types';
import type { ManuscriptMatch } from '../app/projectSearch';
import { ordered } from '../project/tree';
export interface SourceOccurrence extends ManuscriptMatch {
  kind: 'reference' | 'mention';
  matched: string;
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Mask Markdown regions that are source text rather than manuscript prose. Preserve
// every UTF-16 position so a result still points to the original editor text.
function searchableText(text: string): string {
  const masked = text.split('');
  const hide = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (masked[i] !== '\n') masked[i] = ' ';
  };
  let fence: { marker: string; length: number } | null = null;
  let offset = 0;
  for (const line of text.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      hide(offset, offset + line.length);
      if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length) fence = null;
    } else if (marker) {
      fence = { marker: marker[1][0], length: marker[1].length };
      hide(offset, offset + line.length);
    } else if (/^\s*\[\^[^\]]+\]:/.test(line) || /^(?: {4,}|\t)/.test(line)) {
      hide(offset, offset + line.length);
    }
    offset += line.length + 1;
  }
  for (const match of masked.join('').matchAll(/(`+)(?!`)[^`\n]*?\1(?!`)/gu)) {
    hide(match.index, match.index + match[0].length);
  }
  return masked.join('');
}

// Literal names and aliases are navigation aids, not confirmed entity assignments.
// Keep original UTF-16 offsets so CodeMirror can reveal the precise passage.
export function sourceOccurrences(sections: Section[], source: Source): SourceOccurrence[] {
  const names = [...new Set([source.title, ...source.aliases].map((s) => s.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escape);
  const ref = `(?:ariane-[a-z0-9]+-)*source-${escape(source.id.slice(0, 10))}(?:-[a-z0-9]+)*`;
  const references = `\\[@${ref}(?:,[^\\]]*)?\\]|\\[\\^${ref}\\]`;
  const pattern = new RegExp(
    references +
      (names.length ? `|(?<![\\p{L}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{N}_])` : ''),
    'giu',
  );
  const results: SourceOccurrence[] = [];
  for (const section of ordered(sections)) {
    if (section.trashed) continue;
    for (const match of searchableText(section.text).matchAll(pattern)) {
      const from = match.index,
        to = from + match[0].length;
      const matched = section.text.slice(from, to);
      results.push({
        key: `${section.id}:${from}`,
        section: section.id,
        title: section.title || t('Sans titre'),
        from,
        to,
        matched,
        kind: matched.startsWith('[@') || matched.startsWith('[^') ? 'reference' : 'mention',
        excerpt:
          (from > 55 ? '…' : '') +
          section.text.slice(Math.max(0, from - 55), to + 90).replace(/\s+/g, ' ') +
          (to + 90 < section.text.length ? '…' : ''),
      });
    }
  }
  return results;
}
