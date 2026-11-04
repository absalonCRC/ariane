import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { t } from '../i18n';
import { entityColor, entityKind, type SelectedEntity } from '../enrichment/entityTypes';

export const setEntityMarks = StateEffect.define<{
  mentions: SelectedEntity[];
  colors: Record<string, string>;
  enabled?: boolean;
  hidden?: boolean;
}>();
// A transaction invalidates only the logical lines it edits. Other marks keep
// their identity and move with the document, including UTF-16 offsets.
export const entityMarks = StateField.define<{
  mentions: SelectedEntity[];
  colors: Record<string, string>;
  enabled?: boolean;
  hidden?: boolean;
}>({
  create: () => ({ mentions: [], colors: {} }),
  update(value, tr) {
    if (tr.docChanged) {
      const touched: { from: number; to: number }[] = [];
      tr.changes.iterChangedRanges((from, to) => {
        touched.push({ from, to });
      });
      value = {
        ...value,
        mentions: value.mentions
          .filter((m) => {
            const from = m.blockFrom ?? tr.startState.doc.lineAt(m.from).from;
            const to = m.blockTo ?? tr.startState.doc.lineAt(m.to).to;
            return !touched.some(
              (r) => r.to >= from && (r.from < to || r.from === tr.startState.doc.length),
            );
          })
          .map((m) => ({
            ...m,
            from: tr.changes.mapPos(m.from, 1),
            to: tr.changes.mapPos(m.to, -1),
            blockFrom: m.blockFrom === undefined ? undefined : tr.changes.mapPos(m.blockFrom, 1),
            blockTo: m.blockTo === undefined ? undefined : tr.changes.mapPos(m.blockTo, -1),
          })),
      };
    }
    for (const effect of tr.effects) if (effect.is(setEntityMarks)) value = effect.value;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.compute([field, 'doc'], (state) => {
      const { mentions, colors, enabled, hidden } = state.field(field);
      if (hidden) return Decoration.none;
      return Decoration.set(
        mentions.flatMap((m, index) => {
          if (m.from < 0 || m.to > state.doc.length || m.from >= m.to) return [];
          let node = syntaxTree(state).resolveInner(m.from, 1);
          for (;;) {
            if (/Code|URL|LinkMark|HTML/.test(node.name)) return [];
            if (!node.parent) break;
            node = node.parent;
          }
          return [
            Decoration.mark({
              class: 'cm-entity ' + (m.sourceId ? 'cm-entity-known' : 'cm-entity-new'),
              attributes: {
                style: `--entity-color:${enabled === false ? 'inherit' : entityColor(m.kind, colors)}`,
                'data-entity': String(index),
                title: `${t(entityKind(m.kind))} · ${m.sourceId ? t('Fiche existante') : t('Fiche à créer')} · ${t('Cliquer pour consulter')}`,
              },
            }).range(m.from, m.to),
          ];
        }),
        true,
      );
    }),
});
export function entityInteractions(open: (mention: SelectedEntity) => void) {
  return EditorView.domEventHandlers({
    click(event, view) {
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-entity]');
      if (!element || !view.state.selection.main.empty) return false;
      const mention = view.state.field(entityMarks).mentions[Number(element.dataset.entity)];
      if (mention) open(mention);
      return false;
    },
  });
}
