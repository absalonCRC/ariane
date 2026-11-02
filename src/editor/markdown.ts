import { t, getLocale } from '../i18n';
import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { liveTables } from './liveTables';
const delimiters = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'StrikethroughMark',
  'QuoteMark',
  'LinkMark',
]);
class FootnoteMarker extends WidgetType {
  readonly locale = getLocale();
  constructor(
    readonly id: string,
    readonly definition: boolean,
  ) {
    super();
  }
  eq(other: FootnoteMarker) {
    return (
      other.locale === this.locale && other.id === this.id && other.definition === this.definition
    );
  }
  toDOM(view: EditorView) {
    const marker = document.createElement('sup');
    marker.className = 'footnote-marker';
    marker.textContent = '†';
    marker.dataset.tooltip = this.definition
      ? t('Référence de la source')
      : t('Lire la note de source');
    if (!this.definition) {
      marker.setAttribute('role', 'button');
      marker.setAttribute('aria-label', t('Lire la note de source'));
      marker.tabIndex = 0;
      const open = () => {
        const pos = view.state.doc.toString().indexOf(`[^${this.id}]:`);
        if (pos >= 0) {
          view.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: 'center' }),
          });
          view.focus();
        }
      };
      marker.addEventListener('click', open);
      marker.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') open();
      });
    }
    return marker;
  }
}
const inlineMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        u.transactions.some((tr) => tr.reconfigured)
      )
        this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const entries: { from: number; to: number; value: Decoration }[] = [];
      const selection = view.state.selection.main;
      const tree = syntaxTree(view.state);
      for (const range of view.visibleRanges) {
        const notes = Array.from(
          view.state.sliceDoc(range.from, range.to).matchAll(/\[\^([^\]\n]+)\]/g),
          (m) => ({
            from: range.from + m.index!,
            to: range.from + m.index! + m[0].length,
            id: m[1],
          }),
        );
        for (const note of notes) {
          const active = selection.from <= note.to && selection.to >= note.from;
          if (!active)
            entries.push({
              from: note.from,
              to: note.to,
              value: Decoration.replace({
                widget: new FootnoteMarker(
                  note.id,
                  view.state.sliceDoc(note.to, note.to + 1) === ':',
                ),
              }),
            });
        }
        tree.iterate({
          from: range.from,
          to: range.to,
          enter(node) {
            const { name, from, to } = node;
            if (notes.some((n) => from >= n.from && to <= n.to)) return false;
            const parent = node.node.parent;
            if (name === 'Link' && /\]\(ariane:\/\/source\//.test(view.state.sliceDoc(from, to))) return false;
            if (delimiters.has(name) && to > from) {
              const active = parent && selection.from <= parent.to && selection.to >= parent.from;
              if (!active) entries.push({ from, to, value: Decoration.replace({}) });
              else entries.push({ from, to, value: Decoration.mark({ class: 'md-marker' }) });
            }
            if (
              ['StrongEmphasis', 'Emphasis', 'InlineCode', 'Link', 'Strikethrough'].includes(name)
            )
              entries.push({
                from,
                to,
                value: Decoration.mark({ class: 'md-' + name.toLowerCase() }),
              });
            if (/^ATXHeading[1-6]$/.test(name)) {
              const line = view.state.doc.lineAt(from);
              entries.push({
                from: line.from,
                to: line.from,
                value: Decoration.line({ class: 'md-heading md-h' + name.slice(-1) }),
              });
            }
          },
        });
      }
      entries.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
      const builder = new RangeSetBuilder<Decoration>();
      for (const d of entries) builder.add(d.from, d.to, d.value);
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
export const liveMarkdown = [inlineMarkdown, liveTables];
