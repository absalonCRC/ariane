import { wordFocusMode, wordFocusRange } from './focus';
import { StateField, StateEffect } from '@codemirror/state';
import { entityColor } from '../enrichment/entityTypes';
import type { NoteRef } from '../contracts/notes';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type EditorView,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { t } from '../i18n';
export const noteLinkPattern = /\[((?:\\.|[^\]\\\n])+)\]\(ariane:\/\/source\/([^\s)]+)\)/g;
export const setNoteLinkData = StateEffect.define<{
  notes?: NoteRef[];
  colors?: Record<string, string>;
  refresh?: boolean;
  enabled?: boolean;
}>();
export const noteLinkData = StateField.define<{
  notes: Map<string, NoteRef>;
  colors: Record<string, string>;
  version: number;
  enabled: boolean;
}>({
  create: () => ({ notes: new Map(), colors: {}, version: 0, enabled: true }),
  update(value, tr) {
    for (const e of tr.effects)
      if (e.is(setNoteLinkData)) {
        const notes = e.value.refresh ? new Map<string, NoteRef>() : new Map(value.notes);
        for (const n of e.value.notes ?? []) notes.set(n.id, n);
        value = {
          notes,
          colors: e.value.colors ?? value.colors,
          enabled: e.value.enabled ?? value.enabled,
          version: value.version + (e.value.refresh ? 1 : 0),
        };
      }
    return value;
  },
});
class NoteLink extends WidgetType {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly color: string,
    readonly open: (id: string) => void,
    readonly focused: boolean,
  ) {
    super();
  }
  eq(other: NoteLink) {
    return (
      other.id === this.id &&
      other.label === this.label &&
      other.color === this.color &&
      other.focused === this.focused
    );
  }
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'manuscript-note-link' + (this.focused ? ' focused-word' : '');
    button.textContent = this.label;
    button.style.color = this.color;
    button.title = t('Ouvrir la note « {0} »', { 0: this.label });
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.open(this.id));
    return button;
  }
  ignoreEvent() {
    return true;
  }
}
export function noteLinks(
  open: (id: string) => void,
  resolve?: (ids: string[]) => Promise<NoteRef[]>,
) {
  return [
    noteLinkData,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        alive = true;
        pending = new Set<string>();
        attempted = new Set<string>();
        version = 0;
        destroy() {
          this.alive = false;
        }
        constructor(view: EditorView) {
          this.decorations = this.build(view);
        }
        update(u: ViewUpdate) {
          const version = u.state.field(noteLinkData).version;
          if (version !== this.version) {
            this.version = version;
            this.attempted.clear();
            this.pending.clear();
          }
          if (
            u.docChanged ||
            u.selectionSet ||
            u.viewportChanged ||
            u.startState.facet(wordFocusMode) !== u.state.facet(wordFocusMode) ||
            u.transactions.some((tr) => tr.effects.some((e) => e.is(setNoteLinkData)))
          )
            this.decorations = this.build(u.view);
        }
        build(view: EditorView) {
          const ranges = [];
          const mode = view.state.facet(wordFocusMode);
          const focused = mode === null ? null : wordFocusRange(view.state, mode);
          const data = view.state.field(noteLinkData);
          const missing = new Set<string>();
          const seen = new Set<number>();
          const selection = view.state.selection.main;
          for (const range of view.visibleRanges) {
            const start = view.state.doc.lineAt(range.from).from;
            const end = view.state.doc.lineAt(range.to).to;
            for (const match of view.state.sliceDoc(start, end).matchAll(noteLinkPattern)) {
              const from = start + match.index!,
                to = from + match[0].length;
              if (seen.has(from)) continue;
              seen.add(from);
              if (selection.from <= to && selection.to >= from) continue;
              let node = syntaxTree(view.state).resolveInner(from, 1),
                code = false;
              for (;;) {
                if (/Code|HTML/.test(node.name)) {
                  code = true;
                  break;
                }
                if (!node.parent) break;
                node = node.parent;
              }
              if (code) continue;
              try {
                const id = decodeURIComponent(match[2]);
                const note = data.notes.get(id);
                if (!note && !this.pending.has(id) && !this.attempted.has(id)) missing.add(id);
                ranges.push(
                  Decoration.replace({
                    widget: new NoteLink(
                      id,
                      match[1].replace(/\\(.)/g, '$1'),
                      data.enabled ? entityColor(note?.kind ?? 'Note', data.colors) : 'inherit',
                      open,
                      focused?.from === from && focused?.to === to,
                    ),
                  }).range(from, to),
                );
              } catch {
                /* Invalid URI escapes remain editable Markdown. */
              }
            }
          }
          if (resolve && missing.size) {
            const ids = [...missing].slice(0, 200),
              version = this.version;
            ids.forEach((id) => this.pending.add(id));
            void Promise.resolve()
              .then(() => resolve(ids))
              .then((notes) => {
                if (!this.alive || this.version !== version) return;
                ids.forEach((id) => {
                  this.pending.delete(id);
                  this.attempted.add(id);
                });
                view.dispatch({ effects: setNoteLinkData.of({ notes }) });
              })
              .catch(() => {
                if (this.alive && this.version === version)
                  ids.forEach((id) => {
                    this.pending.delete(id);
                    this.attempted.add(id);
                  });
              });
          }
          return Decoration.set(ranges, true);
        }
      },
      { decorations: (v) => v.decorations },
    ),
  ];
}
