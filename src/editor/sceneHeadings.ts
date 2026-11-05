import { t } from '../i18n';
import { StateField } from '@codemirror/state';
import type { EffectiveTag } from '../tags/model';
import { refreshSmartTags } from './smartTags';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Span } from './composite';
class Heading extends WidgetType {
  constructor(
    readonly title: string,
    readonly tags: EffectiveTag[] = [],
    readonly open?: (id: string) => void,
    readonly remove?: (assignment: EffectiveTag) => void,
  ) {
    super();
  }
  eq(other: Heading) {
    return other.title === this.title && JSON.stringify(other.tags) === JSON.stringify(this.tags);
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'scene-heading';
    el.append(document.createTextNode(this.title));
    const list = document.createElement('span');
    list.className = 'scene-heading-tags';
    for (const assignment of this.tags) {
      const tag = assignment.tag;
      const chip = document.createElement('span');
      chip.className = 'smart-tag smart-tag-with-actions';
      chip.style.setProperty('--tag-color', tag.color);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'smart-tag-label';
      button.textContent = '#' + tag.name;
      button.setAttribute('aria-label', t('Afficher les passages avec {0}', { 0: tag.name }));
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => this.open?.(tag.id));
      chip.append(button);
      if (this.remove) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'smart-tag-remove';
        remove.textContent = '×';
        const label = t('Retirer le tag {0} de {1}', {
          0: tag.name,
          1: assignment.origin ?? this.title,
        });
        remove.setAttribute('aria-label', label);
        remove.title = label;
        remove.addEventListener('mousedown', (event) => event.preventDefault());
        remove.addEventListener('click', () => this.remove?.(assignment));
        chip.append(remove);
      }
      list.append(chip);
    }
    if (this.tags.length) el.append(list);
    el.setAttribute('aria-label', this.title);
    return el;
  }
}
export function sceneHeadings(
  field: StateField<Span[]>,
  tags: (section: string) => EffectiveTag[] = () => [],
  open?: (id: string) => void,
  remove?: (assignment: EffectiveTag) => void,
) {
  const refresh = StateField.define({
    create: () => 0,
    update: (value: number, tr) =>
      tr.effects.some((e) => e.is(refreshSmartTags)) ? value + 1 : value,
  });
  return [
    refresh,
    EditorView.decorations.compute([field, refresh], (state) =>
      Decoration.set(
        state.field(field).map((s) =>
          Decoration.widget({
            widget: new Heading(s.title || t('Sans titre'), tags(s.id), open, remove),
            block: true,
            side: -1,
          }).range(s.from),
        ),
      ),
    ),
  ];
}
