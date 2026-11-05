import type { Section } from '../contracts/project';
/** A short quotation of existing text, with Markdown furniture removed. */
export function plainExcerpt(markdown: string, limit = 180): string {
  const lines = markdown.split(/\r?\n/);
  const parts: string[] = [];
  let fence = false;
  let tableColumns = 0;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const separator = /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(line);
    if (separator) {
      tableColumns = Math.max(tableColumns, line.split('|').filter((cell) => cell.trim()).length);
      continue;
    }
    const isTable = line.includes('|') && (line.trim().startsWith('|') || tableColumns > 0);
    const content = isTable
      ? line
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(' · ')
      : line;
    const cleaned = content
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[\^([^\]]+)\]/g, '$1')
      .replace(/\[@([^\]]+)\]/g, '$1')
      .replace(/[*_~`]/g, '')
      .replace(/\\([\\`*_{}\[\]()#+.!|>-])/g, '$1')
      .trim();
    if (cleaned) parts.push(cleaned);
    if (parts.join(' ').length >= limit) break;
  }
  const value = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!value) return tableColumns ? `Tableau de ${tableColumns} colonnes` : '';
  return value.length > limit
    ? `${value
        .slice(0, limit)
        .trimEnd()
        .replace(/[ ,;:.]+$/, '')}…`
    : value;
}

/** Read the persisted outline node, then the paragraph at the saved cursor offset. */
export function passageExcerpt(
  section: Section | undefined,
  node: string | null,
  offset = 0,
): string {
  if (!section?.text) return '';
  const nodes = section.outline?.nodes ?? [];
  const index = nodes.findIndex((entry) => entry.id === node);
  const start = index >= 0 ? nodes[index].start : 0;
  const end = index >= 0 ? (nodes[index + 1]?.start ?? section.text.length) : section.text.length;
  const passage = section.text.slice(start, end);
  const at = Math.max(0, Math.min(passage.length, offset));
  const before = passage.lastIndexOf('\n\n', at);
  const after = passage.indexOf('\n\n', at);
  const paragraph = passage.slice(before < 0 ? 0 : before + 2, after < 0 ? undefined : after);
  return plainExcerpt(paragraph || passage);
}
