import { markdownLanguage } from '@codemirror/lang-markdown';
import type { Outline } from '../../app/types';

export function validOutline(
  text: string,
  outline: Outline | null | undefined,
): outline is Outline {
  if (outline?.version !== 1 || !outline.nodes.length) return false;
  const ids = new Set<string>();
  const ancestors: string[] = [];
  let previous = -1;
  for (const node of outline.nodes) {
    if (
      !node.id ||
      ids.has(node.id) ||
      !Number.isInteger(node.start) ||
      node.start <= previous ||
      node.start > text.length ||
      (previous < 0 ? node.start !== 0 : text[node.start - 1] !== '\n')
    )
      return false;
    if (node.parent === null) ancestors.length = 0;
    else {
      const index = ancestors.indexOf(node.parent);
      if (index < 0) return false;
      ancestors.length = index + 1;
    }
    ids.add(node.id);
    ancestors.push(node.id);
    previous = node.start;
  }
  return true;
}

/** Legacy newlines have no known intent: keep complete Markdown blocks together. */
export function initialOutline(text: string, saved?: Outline | null): Outline {
  if (validOutline(text, saved)) return saved;
  const starts = new Set([0]);
  const tree = markdownLanguage.parser.parse(text);
  for (let block = tree.topNode.firstChild; block; block = block.nextSibling)
    if (block.from && text[block.from - 1] === '\n') starts.add(block.from);
  return {
    version: 1,
    nodes: [...starts]
      .sort((a, b) => a - b)
      .map((start) => ({
        id: crypto.randomUUID(),
        parent: null,
        start,
      })),
  };
}
