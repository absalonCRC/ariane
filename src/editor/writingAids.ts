import {
  Annotation,
  StateEffect,
  StateField,
  Transaction,
  type ChangeDesc,
  EditorState,
} from '@codemirror/state';
import { invertedEffects, isolateHistory } from '@codemirror/commands';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { Section } from '../contracts/project';
import type { WritingAid } from '../contracts/writingAids';
import { blankMarker } from '../project/writingAids';
import type { Span } from './composite';

export interface EditorAid extends WritingAid {
  section: string;
  /** Absolute position in the current composition. */
  from: number | null;
}

export const movedPassages =
  Annotation.define<{ from: number; to: number; destination: number }[]>();
const blank = Decoration.mark({ class: 'cm-writing-blank' });
const trial = Decoration.mark({ class: 'cm-writing-trial' });

function mapPosition(changes: ChangeDesc, from: number, size: number) {
  const start = changes.mapPos(from, 1);
  const end = changes.mapPos(from + size, -1);
  return end - start === size ? start : null;
}

const setAid = StateEffect.define<{ section: string; id: string; aid: EditorAid | null }>({
  map(value, changes) {
    const { aid } = value;
    return aid?.from == null
      ? value
      : { ...value, aid: { ...aid, from: mapPosition(changes, aid.from, aid.quote.length) } };
  },
});
const setAnchor = StateEffect.define<{ section: string; id: string; from: number | null }>({
  map(value, changes) {
    return value.from === null ? value : { ...value, from: changes.mapPos(value.from, 1) };
  },
});
const showTrial = StateEffect.define<{
  section: string;
  id: string;
  alternative: boolean;
} | null>();

const field = StateField.define<EditorAid[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setAid) && !effect.is(setAnchor)) continue;
      const { section, id } = effect.value;
      const index = value.findIndex((aid) => aid.section === section && aid.id === id);
      if (effect.is(setAnchor)) {
        if (index < 0 || value[index].from === effect.value.from) continue;
        const next = { ...value[index], from: effect.value.from };
        value = value.map((aid, at) => (at === index ? next : aid));
      } else if (effect.value.aid) {
        const next = effect.value.aid;
        value = index < 0 ? [...value, next] : value.map((aid, at) => (at === index ? next : aid));
      } else if (index >= 0) {
        value = value.filter((_, at) => at !== index);
      }
    }
    return value;
  },
});

class TrialPreview extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: TrialPreview) {
    return this.text === other.text;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-writing-trial';
    span.textContent = this.text;
    return span;
  }
}

export function writingAids(sections: Section[], spans: StateField<Span[]>) {
  const entries = field.init((state) =>
    state.field(spans).flatMap((span) =>
      (sections.find((section) => section.id === span.id)?.writingAids ?? []).map((aid) => ({
        ...aid,
        section: span.id,
        from: aid.from === null ? null : span.from + aid.from,
      })),
    ),
  );
  // The field identity remains module-local. This extender maps anchors in the
  // same transaction as the scene composition and the text.
  const map = EditorState.transactionExtender.of((tr) => {
    const moves = tr.annotation(movedPassages);
    if (!tr.docChanged && !moves) return null;
    const nextSpans = tr.state.field(spans);
    const effects = [];
    for (const aid of tr.startState.field(field)) {
      if (
        aid.from === null ||
        tr.effects.some(
          (effect) =>
            (effect.is(setAid) || effect.is(setAnchor)) &&
            effect.value.section === aid.section &&
            effect.value.id === aid.id,
        )
      )
        continue;
      const old = aid.from;
      const size = aid.quote.length;
      const move = moves?.find((part) => part.from <= old && part.to >= old + size);
      let replaced = false;
      tr.changes.iterChangedRanges((from, to) => {
        if (from < old + size && to > old) replaced = true;
      });
      let from = move
        ? move.destination + old - move.from
        : replaced
          ? null
          : mapPosition(tr.changes, old, size);
      const span = nextSpans.find((span) => span.id === aid.section);
      if (
        !span ||
        from === null ||
        from < span.from ||
        from + size > span.to ||
        tr.newDoc.sliceString(from, from + size) !== aid.quote
      )
        from = null;
      if (old !== from) effects.push(setAnchor.of({ section: aid.section, id: aid.id, from }));
    }
    return effects.length ? { effects } : null;
  });
  const preview = StateField.define<{
    section: string;
    id: string;
    alternative: boolean;
  } | null>({
    create: () => null,
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(showTrial)) return effect.value;
      return tr.docChanged || tr.state.readOnly ? null : value;
    },
    provide: (source) =>
      EditorView.decorations.compute([source, field], (state) => {
        const active = state.field(source);
        const aid =
          active &&
          state.field(field).find((row) => row.section === active.section && row.id === active.id);
        if (!active || !aid || aid.from === null) return Decoration.none;
        const range =
          active.alternative && aid.value
            ? Decoration.replace({ widget: new TrialPreview(aid.value) })
            : trial;
        return Decoration.set([range.range(aid.from, aid.from + aid.quote.length)]);
      }),
  });
  return [
    entries,
    map,
    preview,
    invertedEffects.of((tr) => {
      const before = tr.startState.field(field);
      return tr.effects.flatMap<StateEffect<unknown>>((effect) => {
        if (!effect.is(setAid) && !effect.is(setAnchor)) return [];
        const { section, id } = effect.value;
        const previous = before.find((aid) => aid.section === section && aid.id === id);
        if (effect.is(setAid)) return [setAid.of({ section, id, aid: previous ?? null })];
        if (
          previous &&
          (previous.from === null ||
            effect.value.from !== mapPosition(tr.changes, previous.from, previous.quote.length) ||
            tr.annotation(movedPassages))
        )
          return [setAnchor.of({ section, id, from: previous.from })];
        return [];
      });
    }),
    ViewPlugin.fromClass(
      class {
        decorations = Decoration.none;
        constructor(view: EditorView) {
          this.paint(view);
        }
        update(update: import('@codemirror/view').ViewUpdate) {
          if (update.docChanged || update.viewportChanged) this.paint(update.view);
        }
        paint(view: EditorView) {
          this.decorations = Decoration.set(
            view.visibleRanges.flatMap(({ from, to }) =>
              Array.from(view.state.sliceDoc(from, to).matchAll(/\[…\]/g), (match) =>
                blank.range(from + match.index, from + match.index + blankMarker.length),
              ),
            ),
          );
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  ];
}

export function editorAids(state: EditorState) {
  return state.field(field, false) ?? [];
}

export function changeAid(view: EditorView, aid: EditorAid, remove = false, history = false) {
  view.dispatch({
    effects: setAid.of({ section: aid.section, id: aid.id, aid: remove ? null : aid }),
    annotations: history ? isolateHistory.of('full') : Transaction.addToHistory.of(false),
  });
}

export function reattachAid(view: EditorView, previous: EditorAid, next: EditorAid) {
  if (previous.section === next.section) {
    changeAid(view, next, false, true);
    return;
  }
  view.dispatch({
    effects: [
      setAid.of({ section: previous.section, id: previous.id, aid: null }),
      setAid.of({ section: next.section, id: next.id, aid: next }),
    ],
    annotations: isolateHistory.of('full'),
  });
}

export function showWritingTrial(view: EditorView, aid: EditorAid | null, alternative = false) {
  view.dispatch({
    effects: showTrial.of(aid && { section: aid.section, id: aid.id, alternative }),
  });
}

export function writeWithAid(
  view: EditorView,
  from: number,
  to: number,
  insert: string,
  aid?: EditorAid,
  remove = false,
) {
  const before = view.state;
  view.dispatch({
    changes: { from, to, insert },
    effects: aid ? [setAid.of({ section: aid.section, id: aid.id, aid: remove ? null : aid })] : [],
    selection: { anchor: from + insert.length },
    annotations: isolateHistory.of('full'),
    userEvent: 'input',
  });
  return view.state.doc !== before.doc || view.state.field(field) !== before.field(field);
}
