import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { t } from '../i18n';
import { entityColor, entityKind, type SelectedEntity } from '../enrichment/entityTypes';

export const setEntityMarks = StateEffect.define<{
  mentions: SelectedEntity[];
  colors: Record<string, string>;
  enabled?: boolean;
}>();
// Drop saved marks on edits. Never attach an inference to a passage whose
// meaning may have changed meanwhile.
export const entityMarks = StateField.define<{
  mentions: SelectedEntity[];
  colors: Record<string, string>;
  enabled?: boolean;
}>({
  create: () => ({ mentions: [], colors: {} }),
  update(value, tr) {
    if (tr.docChanged) value = { ...value, mentions: [] };
    for (const effect of tr.effects) if (effect.is(setEntityMarks)) value = effect.value;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.compute([field, 'doc'], (state) => {
      const { mentions, colors, enabled } = state.field(field);
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
