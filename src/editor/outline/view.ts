import { t, getLocale } from '../../i18n';
import { documentBounds, documentScroller } from '../scrolling';
import { Prec, RangeSetBuilder, type EditorState } from '@codemirror/state';
import type { SmartTag } from '../../contracts/smartTags';
import { refreshSmartTags } from '../smartTags';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { OutlineEditor, OutlineEntry, OutlineSession } from './state';
import { tableHiddenRanges } from '../liveTables';

export function outlinePresentation(
  outline: OutlineEditor,
  tagsForNode?: (state: EditorState, node: OutlineEntry) => SmartTag[],
  onDetails?: (section: string, node: string) => void,
) {
  let activeDrag: { id: string; cancel: () => void } | null = null;
  function activate(view: EditorView, id: string) {
    const session = view.state.field(outline.field);
    const node = session.nodes.find((n) => n.id === id);
    if (node) view.dispatch({ selection: { anchor: node.from } });
    view.focus();
    if (node) onDetails?.(node.section, node.id);
  }
  function beginDrag(view: EditorView, id: string, event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    activeDrag?.cancel();
    if (event.shiftKey) {
      outline.selectBranch(view, id);
      view.focus();
      return;
    }
    const start = { x: event.clientX, y: event.clientY },
      win = view.dom.ownerDocument.defaultView!;
    let moving = false,
      destination: ReturnType<typeof dropTarget> = null;
    const cleanup = () => {
      win.removeEventListener('pointermove', move, true);
      win.removeEventListener('pointerup', up, true);
      win.removeEventListener('pointercancel', cancel, true);
      win.removeEventListener('keydown', key, true);
      activeDrag = null;
      clearDrop(view);
    };
    const cancel = () => cleanup();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      if (!moving && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      moving = true;
      e.preventDefault();
      e.stopPropagation();
      view.dom.dataset.outlineDragging = 'true';
      destination = showDrop(view, e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const target = moving ? (dropTarget(view, e.clientX, e.clientY) ?? destination) : null;
      cleanup();
      if (moving) {
        if (target) outline.relocate(view, id, target.node.id, target.where);
        view.focus();
      } else activate(view, id);
    };
    win.addEventListener('pointermove', move, true);
    win.addEventListener('pointerup', up, true);
    win.addEventListener('pointercancel', cancel, true);
    win.addEventListener('keydown', key, true);
    activeDrag = { id, cancel };
  }
  const hidden = (state: EditorView['state']) => {
    const { nodes, folded } = state.field(outline.field);
    const ranges: { from: number; to: number; count: number }[] = [];
    if (!folded.size) return ranges;
    for (const node of nodes)
      if (folded.has(node.id)) {
        const branch = outline.subtree(nodes, node.id);
        if (branch.length < 2) continue;
        const last = nodes.indexOf(branch.at(-1)!);
        const span = state.field(outline.sectionField).find((s) => s.id === node.section)!;
        const to = nodes[last + 1]?.section === node.section ? nodes[last + 1].from : span.to;
        const from = branch[1].from;
        if (to > from && !ranges.some((r) => r.from <= from && r.to >= to))
          ranges.push({ from, to, count: branch.length - 1 });
      }
    return ranges;
  };
  let foldSession: OutlineSession | undefined;
  let foldSpans: unknown;
  let foldDecorations = Decoration.none;
  const folds = (state: EditorView['state']) => {
    const session = state.field(outline.field),
      spans = state.field(outline.sectionField);
    if (session === foldSession && spans === foldSpans) return foldDecorations;
    foldSession = session;
    foldSpans = spans;
    foldDecorations = Decoration.set(
      hidden(state).map((r) =>
        Decoration.replace({ block: true, inclusive: false }).range(r.from, r.to),
      ),
      true,
    );
    return foldDecorations;
  };
  class PassageMarker extends GutterMarker {
    readonly locale = getLocale();
    constructor(
      readonly node: OutlineEntry,
      readonly children: boolean,
      readonly folded: boolean,
      readonly active: boolean,
      readonly depth: number,
      readonly lineHeight: number,
      readonly tags: SmartTag[],
    ) {
      super();
    }
    eq(other: PassageMarker) {
      return (
        this.locale === other.locale &&
        this.node.id === other.node.id &&
        this.children === other.children &&
        this.folded === other.folded &&
        this.active === other.active &&
        this.depth === other.depth &&
        this.lineHeight === other.lineHeight &&
        this.tags.map((t) => t.id + ':' + t.color + ':' + t.name).join('|') ===
          other.tags.map((t) => t.id + ':' + t.color + ':' + t.name).join('|')
      );
    }
    toDOM(view: EditorView) {
      const controls = document.createElement('span');
      controls.className = 'outline-controls';
      controls.dataset.outlineAnchor = this.node.id;
      controls.style.setProperty('--outline-line-height', this.lineHeight + 'px');
      if (this.children) {
        const chevron = document.createElement('button');
        chevron.type = 'button';
        chevron.className = 'outline-chevron';
        chevron.dataset.folded = String(this.folded);
        chevron.setAttribute(
          'aria-label',
          this.folded ? t('Déplier le passage') : t('Replier le passage'),
        );
        chevron.setAttribute('aria-expanded', String(!this.folded));
        chevron.dataset.tooltip = this.folded ? t('Déplier le passage') : t('Replier le passage');
        chevron.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        chevron.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          outline.toggleFold(view, this.node.id);
          view.focus();
        });
        controls.append(chevron);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'outline-chevron-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        controls.append(spacer);
      }
      const button = document.createElement('button');
      button.className =
        'outline-handle' +
        (this.children ? ' outline-parent' : '') +
        (this.children && this.folded ? ' outline-collapsed' : '') +
        (this.tags.length ? ' outline-tagged' : '') +
        (this.active ? ' outline-current' : '');
      button.type = 'button';
      button.dataset.outlineHandle = this.node.id;
      button.style.setProperty('--outline-depth', String(this.depth));
      button.style.setProperty('--outline-line-height', this.lineHeight + 'px');
      if (this.tags.length) {
        button.style.setProperty('--outline-tag-primary', this.tags[0].color);
        button.style.setProperty(
          '--outline-tag-fill',
          this.tags.length === 1
            ? this.tags[0].color
            : `conic-gradient(${this.tags.map((tag, i) => `${tag.color} ${(i * 100) / this.tags.length}% ${((i + 1) * 100) / this.tags.length}%`).join(',')})`,
        );
      }
      button.tabIndex = this.active ? 0 : -1;
      button.setAttribute('aria-label', t('Détail du passage'));
      button.dataset.state = this.children ? (this.folded ? 'replié' : 'déplié') : 'passage';
      button.dataset.tooltip = t('Glisser pour déplacer · cliquer pour les propriétés');
      button.dataset.tooltip += ' · ' + t('Maj-clic : sélectionner la branche');
      if (this.tags.length)
        button.dataset.tooltip += ' · ' + this.tags.map((tag) => '#' + tag.name).join(' ');
      button.draggable = false;
      button.addEventListener('pointerdown', (event) => beginDrag(view, this.node.id, event));
      button.addEventListener('click', (event) => {
        if (event.detail === 0) {
          if (event.shiftKey) {
            outline.selectBranch(view, this.node.id);
            view.focus();
          } else activate(view, this.node.id);
        }
      });
      controls.append(button);
      return controls;
    }
  }
  const paint = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
        this.align(view);
      }
      destroy() {
        activeDrag?.cancel();
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.startState.field(outline.field) !== update.state.field(outline.field)
        )
          this.decorations = this.build(update.view);
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          update.geometryChanged ||
          update.startState.field(outline.field) !== update.state.field(outline.field)
        )
          this.align(update.view);
      }
      align(view: EditorView) {
        view.requestMeasure({
          key: this,
          read: () => {
            const nodes = outline.index(view.state).byId;
            return Array.from(
              view.dom.querySelectorAll<HTMLElement>('[data-outline-anchor]'),
            ).flatMap((button) => {
              const node = nodes.get(button.dataset.outlineAnchor!);
              const caret = node ? view.coordsAtPos(node.from) : null;
              if (!caret || !button.parentElement) return [];
              const gutter = button.parentElement.getBoundingClientRect();
              return [
                {
                  button,
                  height: caret.bottom - caret.top,
                  top: caret.top - gutter.top,
                  left: caret.left - gutter.left - 44,
                },
              ];
            });
          },
          write: (items) => {
            // CodeMirror hides decorative gutters from assistive technology.
            // This gutter contains real buttons and must expose their labels.
            view.dom
              .querySelector('.cm-outline-gutter')
              ?.parentElement?.removeAttribute('aria-hidden');
            for (const { button, height, top, left } of items) {
              button.style.height = height + 'px';
              button.style.marginTop = top + 'px';
              button.style.transform = `translateX(${left}px)`;
            }
          },
        });
      }
      build(view: EditorView) {
        const { byId, depths } = outline.index(view.state);
        const builder = new RangeSetBuilder<Decoration>();
        for (const range of view.visibleRanges) {
          const last = view.state.doc.lineAt(range.to).number;
          for (let number = view.state.doc.lineAt(range.from).number; number <= last; number++) {
            const line = view.state.doc.line(number);
            const node = outline.entryAt(view.state, line.from);
            if (!node || !byId.has(node.id)) continue;
            const depth = depths.get(node.id) ?? 0;
            builder.add(
              line.from,
              line.from,
              Decoration.line({
                class: 'outline-line',
                attributes: {
                  style: `--outline-depth:${depth}`,
                  'data-outline-id': node.id,
                  ...(line.from === node.from ? { 'data-outline-start': 'true' } : {}),
                },
              }),
            );
          }
        }
        return builder.finish();
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
  function clearDrop(view: EditorView) {
    delete view.dom.dataset.outlineDragging;
    view.dom
      .querySelectorAll('[data-outline-drop]')
      .forEach((el) => el.removeAttribute('data-outline-drop'));
  }
  function dropTarget(view: EditorView, x: number, y: number) {
    const pos = view.posAtCoords({
      x: Math.max(x, view.contentDOM.getBoundingClientRect().left + 1),
      y,
    });
    if (pos === null) return null;
    const node = outline.entryAt(view.state, pos),
      box = view.coordsAtPos(node.from);
    if (!box) return null;
    const where: 'before' | 'after' | 'inside' =
      x > box.left + 22 ? 'inside' : y < (box.top + box.bottom) / 2 ? 'before' : 'after';
    return { node, where };
  }
  function showDrop(view: EditorView, x: number, y: number) {
    view.dom
      .querySelectorAll('[data-outline-drop]')
      .forEach((el) => el.removeAttribute('data-outline-drop'));
    const target = dropTarget(view, x, y);
    if (target) {
      const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-outline-id]')).filter(
        (el) => el.dataset.outlineId === target.node.id,
      );
      (target.where === 'after' ? lines.at(-1) : lines[0])?.setAttribute(
        'data-outline-drop',
        target.where,
      );
    }
    const box = documentBounds(view);
    if (y < box.top + 36) documentScroller(view).scrollTop -= 12;
    else if (y > box.bottom - 36) documentScroller(view).scrollTop += 12;
    return target;
  }
  return [
    tableHiddenRanges.of(hidden),
    Prec.highest(
      keymap.of([
        {
          key: 'Enter',
          run: (view) => !view.composing && outline.enter(view),
          shift: (view) => !view.composing && outline.softBreak(view),
        },
        { key: 'Tab', run: outline.indent, shift: outline.outdent },
        { key: 'Backspace', run: outline.backspace },
        { key: 'Alt-ArrowUp', run: (view) => outline.move(view, -1) },
        { key: 'Alt-ArrowDown', run: (view) => outline.move(view, 1) },
        {
          key: 'Mod-Alt-ArrowLeft',
          run: (view) =>
            view.state.field(outline.field).folded.has(outline.entryAt(view.state).id) ||
            outline.toggleFold(view),
        },
        {
          key: 'Mod-Alt-ArrowRight',
          run: (view) =>
            !view.state.field(outline.field).folded.has(outline.entryAt(view.state).id) ||
            outline.toggleFold(view),
        },
      ]),
    ),
    paint,
    EditorView.decorations.compute([outline.field, outline.sectionField], folds),
    EditorView.atomicRanges.of((view) => folds(view.state)),
    EditorView.domEventHandlers({
      mousemove(event, view) {
        if (view.dom.dataset.outlineDragging) return false;
        view.dom.querySelectorAll<HTMLElement>('[data-outline-handle]').forEach((button) => {
          const box = button.getBoundingClientRect();
          const near =
            event.clientX >= box.left - 4 &&
            event.clientX <= box.right + 4 &&
            event.clientY >= box.top &&
            event.clientY <= box.bottom;
          button.classList.toggle('outline-hover', near);
        });
        return false;
      },
      mouseleave(_event, view) {
        view.dom
          .querySelectorAll('.outline-hover')
          .forEach((button) => button.classList.remove('outline-hover'));
        return false;
      },
      keydown(event, view) {
        if (event.key === 'Escape' && view.dom.dataset.outlineDragging) {
          clearDrop(view);
          return true;
        }
        return false;
      },
    }),
    gutter({
      class: 'cm-outline-gutter',
      lineMarker(view, line) {
        const replacement = hidden(view.state).find(
          (range) => range.from <= line.from && line.from < range.to,
        );
        const from = replacement?.to ?? line.from;
        const node = outline.entryAt(view.state, from);
        if (!node || node.from !== from) return null;
        const session = view.state.field(outline.field);
        const { depths, parents } = outline.index(view.state);
        return new PassageMarker(
          node,
          parents.has(node.id),
          session.folded.has(node.id),
          outline.entryAt(view.state).id === node.id,
          depths.get(node.id) ?? 0,
          view.defaultLineHeight,
          tagsForNode?.(view.state, node) ?? [],
        );
      },
      lineMarkerChange: (u) =>
        u.transactions.some(
          (tr) => tr.reconfigured || tr.effects.some((effect) => effect.is(refreshSmartTags)),
        ) ||
        u.selectionSet ||
        u.geometryChanged ||
        u.startState.field(outline.field) !== u.state.field(outline.field),
    }),
  ];
}
