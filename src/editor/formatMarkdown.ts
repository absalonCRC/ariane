import { EditorState, type ChangeSpec, type TransactionSpec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { Span } from './composite';

export type MarkdownFormat =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'link'
  | 'image'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'paragraph'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'code-block'
  | 'rule'
  | 'table'
  | 'footnote';

function normalizeInlineSelection(state: EditorState): EditorState {
  const selection = state.selection.main;
  if (selection.empty) return state;
  const text = state.sliceDoc(selection.from, selection.to);
  if (!text.trim()) return state;
  let from = selection.from + (text.match(/^\s*/u)?.[0].length ?? 0);
  let to = selection.to - (text.match(/\s*$/u)?.[0].length ?? 0);
  const nodes: { from: number; to: number; openEnd: number; closeStart: number }[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!['StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode'].includes(node.name))
        return;
      const first = node.node.firstChild;
      const last = node.node.lastChild;
      if (!first || !last || !/Mark$/u.test(first.name) || !/Mark$/u.test(last.name)) return;
      nodes.push({ from: node.from, to: node.to, openEnd: first.to, closeStart: last.from });
    },
  });
  for (const node of nodes) {
    if (from >= node.from && from < node.openEnd && to > node.openEnd && to <= node.closeStart)
      from = node.openEnd;
    else if (from < node.from && to > node.openEnd && to < node.to) to = node.to;
    if (to > node.closeStart && to <= node.to && from >= node.openEnd && from < node.closeStart)
      to = node.closeStart;
    else if (to > node.to && from > node.from && from < node.closeStart) from = node.from;
  }
  if (from === selection.from && to === selection.to) return state;
  return state.update({
    selection:
      selection.anchor <= selection.head ? { anchor: from, head: to } : { anchor: to, head: from },
  }).state;
}

function inline(state: EditorState, prefix: string, suffix = prefix): TransactionSpec {
  const selected = state.selection.main;
  const raw = state.sliceDoc(selected.from, selected.to);
  const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
  let from = selected.from + leading;
  const to = Math.max(from, selected.to - trailing);
  if (from > selected.to) from = selected.to;
  const text = state.sliceDoc(from, to);
  if (/\n[ \t]*\n/u.test(text)) {
    const parts = Array.from(text.matchAll(/[^\n]+(?:\n(?![ \t]*\n)[^\n]+)*/gu))
      .filter((match) => match[0].trim())
      .map((match) => {
        const leading = match[0].match(/^\s*/u)?.[0].length ?? 0;
        const trailing = match[0].match(/\s*$/u)?.[0].length ?? 0;
        const start = from + match.index! + leading;
        const end = from + match.index! + match[0].length - trailing;
        const partState = state.update({ selection: { anchor: start, head: end } }).state;
        return inline(partState, prefix, suffix).changes as ChangeSpec[];
      });
    const removes = (changes: ChangeSpec[]) => !('insert' in (changes[0] as object));
    const allMarked = parts.every(removes);
    const changes = state.changes(parts.filter((part) => allMarked || !removes(part)).flat());
    const start = changes.mapPos(selected.from, -1);
    const end = changes.mapPos(selected.to, 1);
    return {
      changes,
      selection:
        selected.anchor <= selected.head
          ? { anchor: start, head: end }
          : { anchor: end, head: start },
      userEvent: 'input.format',
    };
  }
  const before = state.sliceDoc(Math.max(0, from - prefix.length), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + suffix.length));
  const beforeStars =
    prefix === '*'
      ? (state.sliceDoc(state.doc.lineAt(from).from, from).match(/\*+$/u)?.[0].length ?? 0)
      : 0;
  const afterStars =
    prefix === '*'
      ? (state.sliceDoc(to, state.doc.lineAt(to).to).match(/^\*+/u)?.[0].length ?? 0)
      : 0;
  const italicInsideBold = prefix === '*' && (beforeStars % 2 === 0 || afterStars % 2 === 0);
  const selectedStartStars = prefix === '*' ? (text.match(/^\*+/u)?.[0].length ?? 0) : 0;
  const selectedEndStars = prefix === '*' ? (text.match(/\*+$/u)?.[0].length ?? 0) : 0;
  if (before === prefix && after === suffix && !italicInsideBold) {
    return {
      changes: [
        { from: from - prefix.length, to: from },
        { from: to, to: to + suffix.length },
      ],
      selection: { anchor: from - prefix.length, head: to - prefix.length },
      userEvent: 'input.format',
    };
  }
  if (
    text.length >= prefix.length + suffix.length &&
    text.startsWith(prefix) &&
    text.endsWith(suffix) &&
    !(prefix === '*' && (selectedStartStars % 2 === 0 || selectedEndStars % 2 === 0))
  ) {
    return {
      changes: [
        { from, to: from + prefix.length },
        { from: to - suffix.length, to },
      ],
      selection: { anchor: from, head: to - prefix.length - suffix.length },
      userEvent: 'input.format',
    };
  }
  if (from === to) {
    return {
      changes: { from, insert: prefix + suffix },
      selection: { anchor: from + prefix.length },
      userEvent: 'input.format',
    };
  }
  return {
    changes: [
      { from, insert: prefix },
      { from: to, insert: suffix },
    ],
    selection: { anchor: from + prefix.length, head: to + prefix.length },
    userEvent: 'input.format',
  };
}

function link(state: EditorState, image: boolean): TransactionSpec {
  const selection = state.selection.main;
  const raw = state.sliceDoc(selection.from, selection.to);
  const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
  const from = selection.from + leading;
  const to = Math.max(from, selection.to - trailing);
  const text = state.sliceDoc(from, to);
  const prefix = image ? '![' : '[';
  const destination = 'https://';
  if (!text) {
    const placeholder = image ? 'description de l’image' : 'texte du lien';
    const insert = `${prefix}${placeholder}](${destination})`;
    const start = from + prefix.length + placeholder.length + 2;
    return {
      changes: { from, insert },
      selection: { anchor: start, head: start + destination.length },
      userEvent: 'input.format',
    };
  }
  const before = state.sliceDoc(Math.max(0, from - prefix.length), from);
  const existing = state.sliceDoc(to, state.doc.lineAt(to).to).match(/^\]\(([^)]*)\)/u);
  if (before === prefix && existing) {
    const start = to + 2;
    return { selection: { anchor: start, head: start + existing[1].length }, userEvent: 'select' };
  }
  const start = to + prefix.length + 2;
  return {
    changes: [
      { from, insert: prefix },
      { from: to, insert: `](${destination})` },
    ],
    selection: { anchor: start, head: start + destination.length },
    userEvent: 'input.format',
  };
}

function lines(state: EditorState) {
  let { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);
  if (selected.trim()) {
    from += selected.match(/^\s*/u)?.[0].length ?? 0;
    to -= selected.match(/\s*$/u)?.[0].length ?? 0;
  }
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to > from && state.doc.lineAt(to).from === to ? to - 1 : to);
  return Array.from({ length: last.number - first.number + 1 }, (_, index) =>
    state.doc.line(first.number + index),
  );
}

function blockPrefix(state: EditorState, format: MarkdownFormat): TransactionSpec {
  const selected = lines(state);
  const active = selected.filter((line) => line.text.trim() || selected.length === 1);
  const heading = format.startsWith('heading-') ? Number(format.at(-1)) : 0;
  const list = /^([-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/u;
  const markers = active.map((line) => {
    const indentation = line.text.match(/^[ \t]*/u)?.[0].length ?? 0;
    const rest = line.text.slice(indentation);
    const match =
      heading || format === 'paragraph'
        ? rest.match(/^#{1,6}\s+/u)
        : format === 'quote'
          ? rest.match(/^>\s?/u)
          : rest.match(list);
    const marker = match?.[0] ?? '';
    const same = heading
      ? marker.trim() === '#'.repeat(heading)
      : format === 'quote'
        ? !!marker
        : format === 'task'
          ? /^[-+*]\s+\[[ xX]\]\s+$/u.test(marker)
          : format === 'bullet'
            ? /^[-+*]\s+$/u.test(marker)
            : /^\d+[.)]\s+$/u.test(marker);
    return { line, indentation, marker, same };
  });
  const remove = markers.length > 0 && markers.every((item) => item.same);
  const changes: ChangeSpec[] = markers.map(({ line, indentation, marker }, index) => {
    const replacement =
      remove || format === 'paragraph'
        ? ''
        : heading
          ? `${'#'.repeat(heading)} `
          : format === 'quote'
            ? '> '
            : format === 'bullet'
              ? '- '
              : format === 'task'
                ? '- [ ] '
                : `${index + 1}. `;
    return {
      from: line.from + indentation,
      to: line.from + indentation + marker.length,
      insert: replacement,
    };
  });
  const changeSet = state.changes(changes);
  const selection = state.selection.main.empty
    ? { anchor: changeSet.mapPos(state.selection.main.head, 1) }
    : state.selection.map(changeSet);
  return { changes: changeSet, selection, userEvent: 'input.format' };
}

function codeBlock(state: EditorState): TransactionSpec {
  const selected = lines(state);
  const first = selected[0];
  const last = selected[selected.length - 1];
  const previous = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const next = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null;
  const opening = previous?.text.match(/^[ \t]*(`{3,}|~{3,})[^\n]*$/u)?.[1];
  const closing = next?.text.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/u)?.[1];
  if (
    previous &&
    next &&
    opening &&
    closing &&
    opening[0] === closing[0] &&
    closing.length >= opening.length
  ) {
    const changes = state.changes([
      { from: previous.from, to: first.from },
      { from: last.to, to: next.to },
    ]);
    return { changes, selection: state.selection.map(changes), userEvent: 'input.format' };
  }
  const text = state.sliceDoc(first.from, last.to);
  const longest = Array.from(text.matchAll(/`+/gu)).reduce(
    (length, match) => Math.max(length, match[0].length),
    0,
  );
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const changes = state.changes([
    { from: first.from, insert: `${fence}\n` },
    { from: last.to, insert: `\n${fence}` },
  ]);
  const selection = state.selection.main.empty
    ? { anchor: state.selection.main.head + fence.length + 1 }
    : state.selection.map(changes);
  return { changes, selection, userEvent: 'input.format' };
}

function insertBlock(state: EditorState, format: 'rule' | 'table'): TransactionSpec {
  const position = state.doc.lineAt(state.selection.main.to).to;
  const body = format === 'rule' ? '---' : '| Colonne 1 | Colonne 2 |\n| --- | --- |\n|  |  |';
  const prefix = position === 0 ? '' : '\n\n';
  const insert = prefix + body + '\n';
  const start = position + prefix.length + (format === 'table' ? 2 : body.length);
  return {
    changes: { from: position, insert },
    selection: { anchor: start, head: format === 'table' ? start + 9 : start },
    userEvent: 'input.format',
  };
}

function footnote(state: EditorState, spans: readonly Span[]): TransactionSpec {
  const referenceAt = state.selection.main.to;
  const used = new Set(
    Array.from(state.doc.toString().matchAll(/\[\^(\d+)\]/gu), (match) => match[1]),
  );
  let number = 1;
  while (used.has(String(number))) number++;
  const reference = `[^${number}]`;
  const span =
    spans.find((item) => referenceAt >= item.from && referenceAt < item.to) ?? spans.at(-1);
  let end = span?.to ?? state.doc.length;
  while (end > referenceAt && state.sliceDoc(end - 1, end) === '\n') end--;
  const prefix = `\n\n[^${number}]: `;
  const placeholder = 'Texte de la note';
  const definition = prefix + placeholder;
  const changes =
    referenceAt === end
      ? [{ from: referenceAt, insert: reference + definition }]
      : [
          { from: referenceAt, insert: reference },
          { from: end, insert: definition },
        ];
  const start = end + reference.length + prefix.length;
  return {
    changes,
    selection: { anchor: start, head: start + placeholder.length },
    userEvent: 'input.format',
  };
}

export function formatMarkdown(
  state: EditorState,
  format: MarkdownFormat,
  spans: readonly Span[] = [],
): TransactionSpec {
  if (['bold', 'italic', 'strike', 'inline-code', 'link', 'image'].includes(format))
    state = normalizeInlineSelection(state);
  if (format === 'bold') return inline(state, '**');
  if (format === 'italic') return inline(state, '*');
  if (format === 'strike') return inline(state, '~~');
  if (format === 'inline-code') {
    const { from, to } = state.selection.main;
    const text = state.sliceDoc(from, to);
    if (text.includes('\n')) return codeBlock(state);
    const wrapped = text.match(/^(`+)([\s\S]*?)(`+)$/u);
    if (wrapped && wrapped[1].length === wrapped[3].length) return inline(state, wrapped[1]);
    const longest = Array.from(text.matchAll(/`+/gu)).reduce(
      (length, match) => Math.max(length, match[0].length),
      0,
    );
    const fence = '`'.repeat(longest ? longest + 1 : 1);
    const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
    return inline(state, fence + padding, padding + fence);
  }
  if (format === 'link' || format === 'image') return link(state, format === 'image');
  if (format === 'code-block') return codeBlock(state);
  if (format === 'rule' || format === 'table') return insertBlock(state, format);
  if (format === 'footnote') return footnote(state, spans);
  return blockPrefix(state, format);
}
