import { StateEffect, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { SmartTag } from '../contracts/smartTags';
import type { Section } from '../contracts/project';
import type { OutlineEditor, OutlineEntry } from './outline/state';
import { effectiveTags, type EffectiveTag } from '../tags/model';
import { t, getLocale } from '../i18n';
import { smartTagInput } from './tagInput';
export { tagTrigger } from './tagInput';
export const refreshSmartTags = StateEffect.define<void>();
export function smartTags(
  outline: OutlineEditor,
  options: {
    tags: () => SmartTag[];
    sections: () => Section[];
    hidden: () => boolean;
    create: (name: string) => Promise<SmartTag>;
    isCurrent: (view: EditorView) => boolean;
    onError: (error: unknown) => void;
    onTag?: (id: string) => void;
    onPending?: (task: Promise<void>) => void;
    standalone: boolean;
  },
) {
  const input = smartTagInput(outline, options);
  let previousDefinitions: SmartTag[] | undefined;
  let previousSections: Section[] | undefined;
  let definitions = new Map<string, SmartTag>();
  const sectionTags = new Map<string, EffectiveTag[]>();
  const forNode = (state: EditorState, node: OutlineEntry): EffectiveTag[] => {
    const tags = options.tags(),
      sections = options.sections();
    if (tags !== previousDefinitions || sections !== previousSections) {
      previousDefinitions = tags;
      previousSections = sections;
      definitions = new Map(tags.map((tag) => [tag.id, tag]));
      sectionTags.clear();
    }
    const result = new Map<string, EffectiveTag>(),
      seen = new Set<string>();
    const byId = outline.index(state).byId;
    let ancestor: OutlineEntry | undefined = node;
    while (ancestor && !seen.has(ancestor.id)) {
      seen.add(ancestor.id);
      for (const id of ancestor.tagIds ?? []) {
        const tag = definitions.get(id);
        if (tag && !result.has(id))
          result.set(id, {
            tag,
            inherited: ancestor !== node,
            section: node.section,
            node: ancestor.id,
          });
      }
      ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
    }
    if (!sectionTags.has(node.section))
      sectionTags.set(node.section, effectiveTags(tags, sections, node.section));
    for (const value of sectionTags.get(node.section)!)
      if (!result.has(value.tag.id)) result.set(value.tag.id, { ...value, inherited: true });
    return [...result.values()];
  };
  class TagWidget extends WidgetType {
    readonly locale = getLocale();
    constructor(
      readonly node: string,
      readonly tags: EffectiveTag[],
      readonly readOnly: boolean,
    ) {
      super();
    }
    eq(other: TagWidget) {
      return (
        this.locale === other.locale &&
        this.node === other.node &&
        this.readOnly === other.readOnly &&
        JSON.stringify(this.tags) === JSON.stringify(other.tags)
      );
    }
    toDOM(view: EditorView) {
      const host = document.createElement('span');
      host.className = 'inline-smart-tags';
      const stack = document.createElement('span');
      stack.className = 'inline-smart-tag-list';
      host.append(stack);
      for (const value of this.tags) {
        const chip = document.createElement('span');
        chip.className = 'smart-tag' + (value.inherited ? ' inherited' : '');
        chip.classList.add('smart-tag-with-actions');
        chip.style.setProperty('--tag-color', value.tag.color);
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'smart-tag-label';
        label.textContent = '#' + value.tag.name;
        const section = options.sections().find((s) => s.id === value.section);
        const origin = value.node
          ? view.state
              .sliceDoc(outline.index(view.state).byId.get(value.node)?.from ?? 0)
              .split('\n')[0]
              .slice(0, 60)
          : (section?.title ?? '');
        chip.title = [
          value.tag.category,
          value.inherited
            ? t('Hérité de {0}', { 0: origin })
            : t('Afficher les passages avec {0}', { 0: value.tag.name }),
        ]
          .filter(Boolean)
          .join(' · ');
        label.setAttribute(
          'aria-label',
          t('Afficher les passages avec {0}', { 0: value.tag.name }),
        );
        label.addEventListener('mousedown', (event) => event.preventDefault());
        label.addEventListener('click', () => options.onTag?.(value.tag.id));
        chip.append(label);
        if (!this.readOnly && value.node) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'smart-tag-remove';
          remove.textContent = '×';
          remove.setAttribute('aria-label', t('Retirer le tag {0}', { 0: value.tag.name }));
          remove.title = t('Retirer le tag {0}', { 0: value.tag.name });
          remove.addEventListener('mousedown', (event) => event.preventDefault());
          remove.addEventListener('click', (event) => {
            event.stopPropagation();
            const owner = outline.index(view.state).byId.get(value.node!);
            if (owner)
              outline.setTags(
                view,
                owner.id,
                (owner.tagIds ?? []).filter((id) => id !== value.tag.id),
              );
          });
          chip.append(remove);
        }
        stack.append(chip);
      }
      return host;
    }
  }
  const presentation = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.startState.field(outline.field) !== u.state.field(outline.field) ||
          u.transactions.some(
            (tr) => tr.reconfigured || tr.effects.some((e) => e.is(refreshSmartTags)),
          )
        )
          this.decorations = this.build(u.view);
      }
      build(view: EditorView) {
        if (options.hidden() || !options.tags().length) return Decoration.none;
        const { nodes } = view.state.field(outline.field);
        const byId = outline.index(view.state).byId;
        const spans = new Map(view.state.field(outline.sectionField).map((s) => [s.id, s]));
        const marks = [];
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const end =
            nodes[i + 1]?.section === node.section
              ? nodes[i + 1].from - 1
              : spans.get(node.section)!.to;
          if (!view.visibleRanges.some((r) => end >= r.from && end <= r.to)) continue;
          const parent = node.parent ? byId.get(node.parent) : undefined;
          const parentTags = new Set(
            parent ? forNode(view.state, parent).map((value) => value.tag.id) : [],
          );
          const titleTags = new Set(
            effectiveTags(options.tags(), options.sections(), node.section).map(
              ({ tag }) => tag.id,
            ),
          );
          const visible = forNode(view.state, node).filter(
            (value) => !parentTags.has(value.tag.id) && !titleTags.has(value.tag.id),
          );
          if (visible.length)
            marks.push(
              Decoration.widget({
                widget: new TagWidget(node.id, visible, view.state.readOnly),
                side: 1,
              }).range(end),
            );
        }
        return Decoration.set(marks, true);
      }
    },
    { decorations: (v) => v.decorations },
  );
  return {
    source: input.source,
    flush: input.flush,
    tagsForNode: (state: EditorState, node: OutlineEntry) =>
      options.hidden() ? [] : forNode(state, node).map((value) => value.tag),
    extensions: [input.extensions, presentation],
  };
}
