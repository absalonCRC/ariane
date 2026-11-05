import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { t } from '../i18n';
import type { comparePassages } from './comparison';

type Node = {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hName: string };
};
// Mark text leaves in the parsed Markdown tree; manuscript text never becomes HTML.
export function ReadingDiff(p: {
  words: ReturnType<typeof comparePassages>[number]['words'];
  side: 'left' | 'right';
}) {
  const { text, plugin } = useMemo(() => {
    let offset = 0;
    const ranges: { start: number; end: number }[] = [];
    const parts = p.words.filter((w) => (p.side === 'left' ? !w.added : !w.removed));
    for (const word of parts) {
      if (p.side === 'left' ? word.removed : word.added)
        ranges.push({ start: offset, end: offset + word.value.length });
      offset += word.value.length;
    }
    const plugin = () => (tree: Node) => {
      function walk(node: Node) {
        if (!node.children) return;
        node.children = node.children.flatMap((child) => {
          if (child.type !== 'text' || !child.value) {
            walk(child);
            return [child];
          }
          const start = child.position?.start.offset,
            end = child.position?.end.offset;
          if (start === undefined || end === undefined) return [child];
          const overlaps = ranges.filter((r) => r.start < end && r.end > start);
          if (!overlaps.length) return [child];
          const name = p.side === 'left' ? 'del' : 'ins';
          if (end - start !== child.value.length)
            return [{ type: 'marked', data: { hName: name }, children: [child] }];
          const result: Node[] = [];
          let at = 0;
          for (const r of overlaps) {
            const a = Math.max(r.start - start, 0),
              b = Math.min(r.end - start, child.value.length);
            if (a > at) result.push({ type: 'text', value: child.value.slice(at, a) });
            result.push({
              type: 'marked',
              data: { hName: name },
              children: [{ type: 'text', value: child.value.slice(a, b) }],
            });
            at = b;
          }
          if (at < child.value.length) result.push({ type: 'text', value: child.value.slice(at) });
          return result;
        });
      }
      walk(tree);
    };
    return { text: parts.map((w) => w.value).join(''), plugin };
  }, [p.words, p.side]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, plugin]}
      components={{
        a: ({ children }) => <span>{children}</span>,
        img: ({ alt }) => <span>{alt || t('Image')}</span>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
