import { t } from '../../i18n';
import {
  Annotation,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type StateCommand,
} from '@codemirror/state';
import { invertedEffects, isolateHistory } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import type { Outline, Section } from '../../app/types';
import { touchedSpans, type Span } from '../composite';
import { initialOutline } from './model';

export interface OutlineEntry {
  id: string;
  parent: string | null;
  section: string;
  from: number;
}
export interface OutlineSession {
  nodes: OutlineEntry[];
  folded: ReadonlySet<string>;
  changedSections: ReadonlySet<string>;
}
function changesLines(tr: Transaction) {
  let changed = false;
  tr.changes.iterChanges((from, to, _a, _b, inserted) => {
    if (
      inserted.lines > 1 ||
      tr.startState.doc.lineAt(from).number !== tr.startState.doc.lineAt(to).number
    )
      changed = true;
  });
  return changed;
}
interface SplitIntent {
  before?: string;
  parent?: string | null;
}
const internalBreak = Annotation.define<boolean>();
const splitIntent = Annotation.define<SplitIntent>();

export function outlineEditor(
  sections: Section[],
  initialSpans: Span[],
  sectionField: StateField<Span[]>,
) {
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  const initial = initialSpans.flatMap((span) => {
    const section = sectionsById.get(span.id)!;
    return initialOutline(section.text, section.outline).nodes.map((node) => ({
      id: node.id,
      parent: node.parent,
      section: span.id,
      from: span.from + node.start,
    }));
  });
  const replace = StateEffect.define<OutlineEntry[]>({
    map: (nodes, changes) => nodes.map((n) => ({ ...n, from: changes.mapPos(n.from, -1) })),
  });
  const fold = StateEffect.define<{ id: string; folded: boolean }>();
  const field = StateField.define<OutlineSession>({
    create: () => ({ nodes: initial, folded: new Set(), changedSections: new Set() }),
    update(value, tr) {
      let nodes = value.nodes;
      const replacement = tr.effects.find((e) => e.is(replace));
      if (replacement) nodes = replacement.value;
      else if (tr.docChanged) nodes = mapChanges(value.nodes, tr);
      let folded = value.folded;
      for (const effect of tr.effects)
        if (effect.is(fold)) {
          folded = new Set(folded);
          if (effect.value.folded) (folded as Set<string>).add(effect.value.id);
          else (folded as Set<string>).delete(effect.value.id);
        }
      if (nodes === value.nodes && folded === value.folded) return value;
      const changedSections = touchedSpans(tr.startState.field(sectionField), tr.changes);
      if (replacement) {
        const oldSpans = new Map(tr.startState.field(sectionField).map((s) => [s.id, s]));
        const newSpans = new Map(tr.state.field(sectionField).map((s) => [s.id, s]));
        const previous = new Map(value.nodes.map((n) => [n.id, n]));
        for (const node of nodes) {
          const old = previous.get(node.id);
          if (
            !old ||
            old.parent !== node.parent ||
            old.section !== node.section ||
            old.from - oldSpans.get(old.section)!.from !==
              node.from - newSpans.get(node.section)!.from
          )
            changedSections.add(node.section);
          previous.delete(node.id);
        }
        for (const node of previous.values()) changedSections.add(node.section);
      }
      return { nodes, folded, changedSections };
    },
  });
  // Cache only the current node array: undo history must not retain extra indexes.
  let indexedNodes: OutlineEntry[] | undefined;
  let cachedIndex: ReturnType<typeof buildIndex>;
  function buildIndex(nodes: OutlineEntry[]): {
    bySection: Map<string, OutlineEntry[]>;
    byId: Map<string, OutlineEntry>;
    depths: Map<string, number>;
    parents: Set<string>;
  } {
    const bySection = new Map<string, OutlineEntry[]>();
    const byId = new Map<string, OutlineEntry>();
    const sameStructure =
      indexedNodes?.length === nodes.length &&
      nodes.every(
        (node, i) => node.id === indexedNodes![i].id && node.parent === indexedNodes![i].parent,
      );
    const depths = sameStructure ? cachedIndex.depths : new Map<string, number>();
    const parents = sameStructure ? cachedIndex.parents : new Set<string>();
    for (const node of nodes) {
      const own = bySection.get(node.section);
      if (own) own.push(node);
      else bySection.set(node.section, [node]);
      byId.set(node.id, node);
      if (!sameStructure) {
        depths.set(node.id, node.parent ? (depths.get(node.parent) ?? 0) + 1 : 0);
        if (node.parent) parents.add(node.parent);
      }
    }
    return { bySection, byId, depths, parents };
  }
  function indexNodes(nodes: OutlineEntry[]) {
    if (nodes !== indexedNodes) {
      cachedIndex = buildIndex(nodes);
      indexedNodes = nodes;
    }
    return cachedIndex;
  }
  const index = (state: EditorState) => indexNodes(state.field(field).nodes);
  const sectionAt = (spans: Span[], pos: number) => {
    let low = 0,
      high = spans.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (spans[mid].to <= pos) low = mid + 1;
      else high = mid;
    }
    return spans[low]?.from <= pos ? spans[low] : spans.at(-1)!;
  };
  const entryIn = (nodes: OutlineEntry[], section: string, pos: number) => {
    const own = indexNodes(nodes).bySection.get(section)!;
    let low = 0,
      high = own.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (own[mid].from <= pos) low = mid + 1;
      else high = mid;
    }
    return own[Math.max(0, low - 1)];
  };
  const entryAt = (state: EditorState, pos = state.selection.main.head) => {
    const scene = sectionAt(state.field(sectionField), pos);
    const nodes = state.field(field).nodes;
    return entryIn(nodes, scene.id, pos);
  };
  function mapChanges(previous: OutlineEntry[], tr: Transaction): OutlineEntry[] {
    const spans = tr.state.field(sectionField);
    const oldSpans = tr.startState.field(sectionField);
    const intent = tr.annotation(splitIntent);
    // Ordinary typing cannot change parentage or passage starts relative to lines.
    if (!changesLines(tr) && !intent) {
      let first = Infinity;
      tr.changes.iterChangedRanges((from) => {
        first = Math.min(first, from);
      });
      let low = 0,
        high = previous.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (previous[mid].from <= first) low = mid + 1;
        else high = mid;
      }
      let mapped: OutlineEntry[] | undefined;
      for (let i = low; i < previous.length; i++) {
        const node = previous[i],
          from = tr.changes.mapPos(node.from, -1);
        if (from !== node.from) {
          mapped ??= previous.slice();
          mapped[i] = { ...node, from };
        }
      }
      return mapped ?? previous.slice();
    }
    const removed = new Set<string>();
    const merged = new Map<string, string>();
    tr.changes.iterChangedRanges((from, to) => {
      if (to > from) {
        const owner = entryIn(previous, sectionAt(oldSpans, from).id, from);
        for (const n of previous)
          if (n.from > from && n.from <= to) {
            removed.add(n.id);
            if (owner.section === n.section) merged.set(n.id, owner.id);
          }
      }
    });
    const nodes = previous
      .filter((n) => !removed.has(n.id))
      .map((n) => ({
        ...n,
        from: tr.changes.mapPos(n.from, intent?.before === n.id ? 1 : -1),
      }));
    const occupied = new Set(nodes.map((node) => `${node.section}:${node.from}`));
    const spansById = new Map(spans.map((span) => [span.id, span]));
    if (intent?.before) {
      const original = previous.find((n) => n.id === intent.before)!;
      nodes.push({
        ...original,
        id: crypto.randomUUID(),
        from: tr.changes.mapPos(original.from, -1),
      });
    }
    if (!tr.annotation(internalBreak))
      tr.changes.iterChanges((fromA, _toA, fromB, _toB, inserted) => {
        const oldSection = sectionAt(oldSpans, fromA);
        const origin = entryIn(previous, oldSection.id, fromA);
        const text = inserted.toString();
        for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
          const from = fromB + i + 1;
          const section = spansById.get(oldSection.id)!;
          const position = `${section.id}:${from}`;
          if (from > section.to || occupied.has(position)) continue;
          occupied.add(position);
          const hasChildren = origin && indexNodes(previous).parents.has(origin.id);
          nodes.push({
            id: crypto.randomUUID(),
            section: section.id,
            from,
            parent:
              intent && 'parent' in intent
                ? intent.parent!
                : hasChildren
                  ? origin!.id
                  : (origin?.parent ?? null),
          });
        }
      });
    const byId = new Map(previous.map((n) => [n.id, n]));
    const bySection = new Map<string, OutlineEntry[]>();
    for (const node of nodes) {
      const own = bySection.get(node.section);
      if (own) own.push(node);
      else bySection.set(node.section, [node]);
    }
    return spans.flatMap((span) => {
      const own = (bySection.get(span.id) ?? [])
        .filter((n) => n.from >= span.from && n.from <= span.to)
        .sort((a, b) => a.from - b.from);
      if (!own.length || own[0].from !== span.from)
        own.unshift({ id: crypto.randomUUID(), section: span.id, parent: null, from: span.from });
      const stack: string[] = [];
      const result: OutlineEntry[] = [];
      for (const n of own) {
        if (result.at(-1)?.from === n.from) continue;
        if (n.from !== span.from && tr.state.doc.sliceString(n.from - 1, n.from) !== '\n') continue;
        let parent = n.parent;
        const seen = new Set<string>();
        while (parent && !stack.includes(parent) && !seen.has(parent)) {
          seen.add(parent);
          parent = merged.get(parent) ?? byId.get(parent)?.parent ?? null;
        }
        if (!parent || !stack.includes(parent)) {
          parent = null;
          stack.length = 0;
        } else stack.length = stack.indexOf(parent) + 1;
        result.push(parent === n.parent ? n : { ...n, parent });
        stack.push(n.id);
      }
      return result;
    });
  }
  function serialize(state: EditorState, span: Span): Outline {
    return {
      version: 1,
      nodes: (index(state).bySection.get(span.id) ?? []).map((n) => ({
        id: n.id,
        parent: n.parent,
        start: n.from - span.from,
      })),
    };
  }
  function subtree(nodes: OutlineEntry[], id: string): OutlineEntry[] {
    const first = nodes.findIndex((n) => n.id === id);
    const ids = new Set([id]);
    let end = first + 1;
    while (end < nodes.length && nodes[end].parent && ids.has(nodes[end].parent!))
      ids.add(nodes[end++].id);
    return nodes.slice(first, end);
  }
  function rewrite(
    target: Parameters<StateCommand>[0],
    order: OutlineEntry[],
    selected: OutlineEntry,
    parent: string | null = selected.parent,
  ): boolean {
    const { state, dispatch } = target;
    const span = state.field(sectionField).find((s) => s.id === selected.section)!;
    const previous = state.field(field).nodes.filter((n) => n.section === span.id);
    const body = new Map(
      previous.map((n, i) => [
        n.id,
        state.sliceDoc(n.from, i < previous.length - 1 ? previous[i + 1].from - 1 : span.to),
      ]),
    );
    let pos = span.from;
    const next = order.map((n) => {
      const item = { ...n, parent: n.id === selected.id ? parent : n.parent, from: pos };
      pos += body.get(n.id)!.length + 1;
      return item;
    });
    const text = order.map((n) => body.get(n.id)!).join('\n');
    const caret =
      next.find((n) => n.id === selected.id)!.from +
      Math.max(
        0,
        Math.min(state.selection.main.head - selected.from, body.get(selected.id)!.length),
      );
    const nextById = new Map(next.map((node) => [node.id, node]));
    const all = state
      .field(field)
      .nodes.map((n) => nextById.get(n.id) ?? n)
      .sort((a, b) => a.from - b.from);
    dispatch(
      state.update({
        changes:
          text === state.sliceDoc(span.from, span.to)
            ? []
            : { from: span.from, to: span.to, insert: text },
        effects: replace.of(all),
        selection: { anchor: caret },
        annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.outline')],
        scrollIntoView: true,
      }),
    );
    return true;
  }
  const enter: StateCommand = (target) => {
    const { state, dispatch } = target,
      selection = state.selection.main;
    const node = entryAt(state, selection.from),
      nodes = state.field(field).nodes;
    const branch = subtree(nodes, node.id);
    const own = nodes.filter((n) => n.section === node.section);
    const index = own.findIndex((n) => n.id === node.id);
    const span = state.field(sectionField).find((s) => s.id === node.section)!;
    const end = own[index + 1]?.from !== undefined ? own[index + 1].from - 1 : span.to;
    if (
      selection.empty &&
      branch.length > 1 &&
      state.field(field).folded.has(node.id) &&
      selection.head > node.from
    ) {
      const next = own[own.indexOf(branch.at(-1)!) + 1];
      const branchEnd = next ? next.from - 1 : span.to;
      const suffix = state.sliceDoc(selection.head, end);
      dispatch(
        state.update({
          changes: [
            { from: selection.head, to: end, insert: '' },
            { from: branchEnd, insert: '\n' + suffix },
          ],
          selection: { anchor: branchEnd - suffix.length + 1 },
          annotations: [
            splitIntent.of({ parent: node.parent }),
            isolateHistory.of('full'),
            Transaction.userEvent.of('input.outline'),
          ],
        }),
      );
      return true;
    }
    const before = selection.empty && selection.head === node.from && end > node.from;
    dispatch(
      state.update({
        ...state.replaceSelection('\n'),
        annotations: [
          splitIntent.of(
            before ? { before: node.id } : { parent: branch.length > 1 ? node.id : node.parent },
          ),
          isolateHistory.of('full'),
          Transaction.userEvent.of('input.outline'),
        ],
        scrollIntoView: true,
      }),
    );
    return true;
  };
  const softBreak: StateCommand = ({ state, dispatch }) => {
    dispatch(
      state.update({
        ...state.replaceSelection('\n'),
        annotations: [
          internalBreak.of(true),
          isolateHistory.of('full'),
          Transaction.userEvent.of('input.outline'),
        ],
        scrollIntoView: true,
      }),
    );
    return true;
  };
  const indent: StateCommand = (target) => {
    const { state } = target,
      node = entryAt(state);
    const own = state.field(field).nodes.filter((n) => n.section === node.section);
    const siblings = own.filter((n) => n.parent === node.parent),
      index = siblings.indexOf(node);
    if (index < 1) return true;
    return rewrite(target, own, node, siblings[index - 1].id);
  };
  const outdent: StateCommand = (target) => {
    const { state } = target,
      node = entryAt(state);
    if (!node.parent) return true;
    const own = state.field(field).nodes.filter((n) => n.section === node.section);
    const parent = own.find((n) => n.id === node.parent)!;
    const moving = subtree(own, node.id),
      ids = new Set(moving.map((n) => n.id));
    const remaining = own.filter((n) => !ids.has(n.id));
    const parentBranch = subtree(remaining, parent.id);
    const index = remaining.indexOf(parentBranch.at(-1)!) + 1;
    remaining.splice(index, 0, ...moving);
    return rewrite(target, remaining, node, parent.parent);
  };
  function move(target: Parameters<StateCommand>[0], direction: -1 | 1): boolean {
    const { state } = target,
      node = entryAt(state);
    const own = state.field(field).nodes.filter((n) => n.section === node.section);
    const siblings = own.filter((n) => n.parent === node.parent),
      index = siblings.indexOf(node);
    const other = siblings[index + direction];
    if (!other) return true;
    const moving = subtree(own, node.id),
      ids = new Set(moving.map((n) => n.id));
    const remaining = own.filter((n) => !ids.has(n.id));
    const at =
      direction < 0
        ? remaining.indexOf(other)
        : remaining.indexOf(subtree(remaining, other.id).at(-1)!) + 1;
    remaining.splice(at, 0, ...moving);
    return rewrite(target, remaining, node);
  }
  function relocate(
    target: Parameters<StateCommand>[0],
    id: string,
    destination: string,
    where: 'before' | 'after' | 'inside',
  ): boolean {
    const nodes = target.state.field(field).nodes;
    const node = nodes.find((n) => n.id === id),
      other = nodes.find((n) => n.id === destination);
    if (!node || !other || node.section !== other.section) return false;
    const moving = subtree(nodes, id),
      ids = new Set(moving.map((n) => n.id));
    if (ids.has(destination)) return false;
    const remaining = nodes.filter((n) => n.section === node.section && !ids.has(n.id));
    const at =
      where === 'before'
        ? remaining.indexOf(other)
        : remaining.indexOf(subtree(remaining, other.id).at(-1)!) + 1;
    remaining.splice(at, 0, ...moving);
    return rewrite(target, remaining, node, where === 'inside' ? other.id : other.parent);
  }
  function toggleFold(target: Parameters<StateCommand>[0], id = entryAt(target.state).id): boolean {
    const session = target.state.field(field);
    if (!session.nodes.some((n) => n.parent === id)) return true;
    const node = session.nodes.find((n) => n.id === id)!;
    const next = session.nodes[session.nodes.indexOf(node) + 1];
    const head = target.state.selection.main.head;
    const caret = head >= node.from && (!next || head < next.from) ? head : node.from;
    target.dispatch(
      target.state.update({
        effects: fold.of({ id, folded: !session.folded.has(id) }),
        selection: { anchor: caret },
        annotations: Transaction.addToHistory.of(false),
      }),
    );
    return true;
  }
  const backspace: StateCommand = (target) => {
    const selection = target.state.selection.main,
      node = entryAt(target.state);
    if (selection.empty && selection.head === node.from && node.parent) return outdent(target);
    return false;
  };
  const inversion = invertedEffects.of((tr) =>
    tr.startState.field(field).nodes !== tr.state.field(field).nodes &&
    (changesLines(tr) || tr.effects.some((effect) => effect.is(replace)))
      ? [replace.of(tr.startState.field(field).nodes)]
      : [],
  );
  const protectHidden = EditorState.transactionFilter.of((tr) => {
    if (tr.effects.some((e) => e.is(replace) || e.is(fold))) return tr;
    const { nodes, folded } = tr.startState.field(field);
    if (!folded.size) return tr;
    let destructive = false;
    const hidden: { from: number; to: number; parentEnd: number }[] = [];
    for (const node of nodes)
      if (folded.has(node.id)) {
        const branch = subtree(nodes, node.id);
        if (branch.length < 2) continue;
        const index = nodes.indexOf(branch.at(-1)!);
        const span = tr.startState.field(sectionField).find((s) => s.id === node.section)!;
        const from = branch[1].from,
          to = nodes[index + 1]?.section === node.section ? nodes[index + 1].from : span.to;
        hidden.push({ from, to, parentEnd: from - 1 });
        tr.changes.iterChangedRanges((a, b) => {
          if (a < b && a < to && b > from) destructive = true;
        });
      }
    if (destructive && !tr.isUserEvent('undo') && !tr.isUserEvent('redo'))
      return {
        effects: EditorView.announce.of(
          t('Ce passage contient des enfants repliés. Dépliez le parent pour modifier ce contenu.'),
        ),
        selection: tr.startState.selection,
        annotations: Transaction.addToHistory.of(false),
      };
    if (tr.selection && !tr.annotation(splitIntent)) {
      const visible = (pos: number) => {
        for (const range of hidden) {
          const start = tr.changes.mapPos(range.from, 1),
            end = tr.changes.mapPos(range.to, -1);
          if (pos >= start && (pos < end || (pos === end && end === tr.newDoc.length)))
            return tr.changes.mapPos(range.parentEnd, -1);
        }
        return pos;
      };
      const ranges = tr.newSelection.ranges.map((range) =>
        EditorSelection.range(visible(range.anchor), visible(range.head)),
      );
      const selection = EditorSelection.create(ranges, tr.newSelection.mainIndex);
      if (!selection.eq(tr.newSelection)) return [tr, { selection }];
    }
    return tr;
  });
  const extensions: Extension = [field, inversion, protectHidden];
  return {
    reveal(target: EditorView, id: string, focus = true) {
      const node = index(target.state).byId.get(id);
      if (!node) return false;
      const effects: StateEffect<unknown>[] = [];
      let parent = node.parent;
      while (parent) {
        effects.push(fold.of({ id: parent, folded: false }));
        parent = index(target.state).byId.get(parent)?.parent ?? null;
      }
      effects.push(EditorView.scrollIntoView(node.from, { y: 'center' }));
      target.dispatch({
        effects,
        selection: { anchor: node.from },
        annotations: Transaction.addToHistory.of(false),
      });
      if (focus) target.focus();
      return true;
    },
    field,
    extensions,
    serialize,
    enter,
    softBreak,
    indent,
    outdent,
    move,
    toggleFold,
    backspace,
    entryAt,
    subtree,
    relocate,
    sectionField,
    index,
  };
}
export type OutlineEditor = ReturnType<typeof outlineEditor>;
