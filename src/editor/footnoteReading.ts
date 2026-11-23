import { Facet, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { t } from '../i18n';
import type { Span } from './composite';

export const footnoteScenes = Facet.define<(state: EditorState) => Span[]>();
export const toggleFootnote = StateEffect.define<number>();
export function isFootnote(state: EditorState, from: number) {
  const line = state.doc.lineAt(from);
  if ((line.text.slice(0, from - line.from).match(/\\+$/)?.[0].length ?? 0) % 2) return false;
  for (let n = syntaxTree(state).resolveInner(from, 1); ;) {
    if (/Code|HTML/.test(n.name)) return false;
    if (!n.parent) return true;
    n = n.parent;
  }
}
class FootnoteText extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: FootnoteText) {
    return this.text === other.text;
  }
  toDOM() {
    const el = document.createElement('aside');
    el.className = 'footnote-reading';
    el.textContent = this.text;
    return el;
  }
}
function read(state: EditorState, pos: number, id: string) {
  const span = state
    .facet(footnoteScenes)[0]?.(state)
    .find((s) => pos >= s.from && pos < s.to);
  const end = span?.to ?? state.doc.length;
  const definitions: string[] = [];
  for (let i = state.doc.lineAt(span?.from ?? 0).number; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (line.from >= end) break;
    const m = /^( {0,3})\[\^([^\]\n]+)\]:[ \t]*(.*)$/.exec(line.text);
    if (m?.[2] !== id || !isFootnote(state, line.from + m[1].length)) continue;
    let body = m[3];
    for (let j = i + 1; j <= state.doc.lines; j++) {
      const next = state.doc.line(j);
      if (next.from >= end) break;
      if (
        !next.text.trim() &&
        j < state.doc.lines &&
        /^( {4}|\t)/.test(state.doc.line(j + 1).text)
      ) {
        body += '\n';
        continue;
      }
      if (!/^( {4}|\t)/.test(next.text)) break;
      body += '\n' + next.text.replace(/^( {4}|\t)/, '');
    }
    definitions.push(body);
  }
  return definitions.length === 1 ? definitions[0] : t('Définition absente ou ambiguë.');
}
export const footnoteReading = StateField.define<{
  pos: number;
  id: string;
  marks: ReturnType<typeof Decoration.set>;
}>({
  create: () => ({ pos: -1, id: '', marks: Decoration.none }),
  update(old, tr) {
    const toggle = tr.effects.find((e) => e.is(toggleFootnote));
    if (!toggle && !tr.docChanged && !tr.reconfigured) return old;
    let pos = old.pos < 0 ? -1 : tr.changes.mapPos(old.pos, 1);
    if (toggle) pos = pos === toggle.value ? -1 : toggle.value;
    const line = pos >= 0 ? tr.state.doc.lineAt(pos) : null;
    const id = line && /^\[\^([^\]]+)\](?!:)/.exec(line.text.slice(pos - line.from))?.[1];
    if (!line || !id || (!toggle && id !== old.id) || !isFootnote(tr.state, pos))
      return { pos: -1, id: '', marks: Decoration.none };
    const widget = new FootnoteText(read(tr.state, pos, id));
    return {
      pos,
      id,
      marks: Decoration.set([Decoration.widget({ widget, block: true, side: 1 }).range(line.to)]),
    };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.marks),
});
