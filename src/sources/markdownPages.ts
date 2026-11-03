import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
export const PAGE_SIZE = 24_000;
export interface MarkdownPage {
  from: number;
  to: number;
  plain?: boolean;
}
export interface MarkdownPages {
  pages: MarkdownPage[];
  definitions: string;
}
export function plainPages(text: string): MarkdownPages {
  const pages: MarkdownPage[] = [];
  for (let from = 0; from < text.length;) {
    let to = Math.min(text.length, from + PAGE_SIZE);
    if (to < text.length && /[\uD800-\uDBFF]/.test(text[to - 1])) to--;
    pages.push({ from, to, plain: true });
    from = to;
  }
  return { pages, definitions: '' };
}
export function markdownPages(text: string): MarkdownPages {
  const tree = fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const definitions = tree.children
    .filter((n) => n.type === 'definition' || n.type === 'footnoteDefinition')
    .map((n) => text.slice(n.position!.start.offset!, n.position!.end.offset!))
    .join('\n\n');
  if (definitions.length > PAGE_SIZE) return plainPages(text);
  const pages: MarkdownPage[] = [];
  let from = 0,
    to = 0;
  for (const node of tree.children) {
    const end = node.position!.end.offset!;
    if (end - from <= PAGE_SIZE) {
      to = end;
      continue;
    }
    if (to > from) {
      pages.push({ from, to });
      from = to;
    }
    if (end - from > PAGE_SIZE) {
      for (const page of plainPages(text.slice(from, end)).pages)
        pages.push({ ...page, from: from + page.from, to: from + page.to });
      from = end;
    }
    to = end;
  }
  if (text.length > from) pages.push({ from, to: text.length });
  return { pages, definitions };
}
