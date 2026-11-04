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
// Keep literal names through context edits; invalidate only a changed name.
// Positions follow the document in UTF-16, including within the edited line.
export const entityMarks = StateField.define<{
  mentions: SelectedEntity[];
  colors: Record<string, string>;
  enabled?: boolean;
  hidden?: boolean;
}>({
  create: () => ({ mentions: [], colors: {} }),
  update(value, tr) {
    if (tr.docChanged) {
      value = {
        ...value,
        mentions: value.mentions.flatMap((m) => {
          const from = tr.changes.mapPos(m.from, 1);
          const to = tr.changes.mapPos(m.to, -1);
          const name = tr.startState.sliceDoc(m.from, m.to);
          if (from >= to || tr.state.sliceDoc(from, to) !== name) return [];
          // Extending a name at either edge changes its identity too.
          const word = /[\p{L}\p{N}_]/u;
          if (
            (from > 0 &&
              word.test(tr.state.sliceDoc(from - 1, from)) &&
              (m.from === 0 || !word.test(tr.startState.sliceDoc(m.from - 1, m.from)))) ||
            (to < tr.state.doc.length &&
              word.test(tr.state.sliceDoc(to, to + 1)) &&
              (m.to === tr.startState.doc.length ||
                !word.test(tr.startState.sliceDoc(m.to, m.to + 1))))
          )
            return [];
          return [
            {
              ...m,
              from,
              to,
              blockFrom: m.blockFrom === undefined ? undefined : tr.changes.mapPos(m.blockFrom, 1),
              blockTo: m.blockTo === undefined ? undefined : tr.changes.mapPos(m.blockTo, -1),
            },
          ];
        }),
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
                title: `${t(entityKind(m.kind))} · ${m.sourceId ? t('Fiche existante') : t('Identifier cette entité')} · ${t('Cliquer pour consulter')}`,
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
