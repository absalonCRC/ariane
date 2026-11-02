import { t } from '../i18n';
import type { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Span } from './composite';
class Heading extends WidgetType {
  constructor(readonly title: string) {
    super();
  }
  eq(other: Heading) {
    return other.title === this.title;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'scene-heading';
    el.textContent = this.title;
    el.setAttribute('aria-label', this.title);
    return el;
  }
}
export function sceneHeadings(field: StateField<Span[]>) {
  return EditorView.decorations.compute([field], (state) =>
    Decoration.set(
      state
        .field(field)
        .map((s) =>
          Decoration.widget({
            widget: new Heading(s.title || t('Sans titre')),
            block: true,
            side: -1,
          }).range(s.from),
        ),
    ),
  );
}
