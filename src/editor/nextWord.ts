import { Prec, StateEffect, type Text } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view';
import { completionStatus } from '@codemirror/autocomplete';
import type { WordSuggestion } from '../contracts/prediction';
import { acceptsPredictionShortcut } from '../app/commands/shortcuts';
import { request } from '../platform/client';

export interface PredictionConfiguration {
  language: string;
  distinct: boolean;
  epoch: number;
  projectPath?: string;
}

interface Context extends PredictionConfiguration {
  doc: Text;
  at: number;
  text: string;
}
interface Proposal {
  context: Context;
  value: WordSuggestion;
}

export const refreshPrediction = StateEffect.define<void>();
const display = StateEffect.define<Proposal | null>();
const codeNodes = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
const debounceMs = 145;

class GhostWord extends WidgetType {
  constructor(
    readonly word: string,
    readonly distinct: boolean,
  ) {
    super();
  }
  eq(other: GhostWord) {
    return this.word === other.word && this.distinct === other.distinct;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-predicted-word';
    span.dataset.distinct = String(this.distinct);
    span.setAttribute('aria-hidden', 'true');
    span.textContent = this.word;
    return span;
  }
}

function context(view: EditorView, configuration: PredictionConfiguration | null): Context | null {
  const { state } = view;
  const { main, ranges } = state.selection;
  if (
    !configuration ||
    state.readOnly ||
    !view.hasFocus ||
    view.compositionStarted ||
    !main.empty ||
    ranges.length !== 1 ||
    completionStatus(state) === 'active'
  )
    return null;
  const at = main.head;
  const line = state.doc.lineAt(at);
  if (at !== line.to || at === line.from) return null;
  let node = syntaxTree(state).resolveInner(at, -1);
  while (node) {
    if (codeNodes.has(node.name)) return null;
    if (!node.parent) break;
    node = node.parent;
  }
  const text = state.sliceDoc(Math.max(line.from, at - 320), at);
  if (!/[\p{L}\p{M}][ \u00a0\u202f]+$/u.test(text)) return null;
  return { ...configuration, doc: state.doc, at, text };
}

export function nextWord(configuration: () => PredictionConfiguration | null) {
  return Prec.highest(
    ViewPlugin.fromClass(
      class {
        decorations = Decoration.none;
        private proposal: Proposal | null = null;
        private timer: ReturnType<typeof setTimeout> | undefined;
        private generation = 0;

        private clear() {
          clearTimeout(this.timer);
          this.generation++;
          this.setProposal(null);
        }

        private setProposal(proposal: Proposal | null) {
          this.proposal = proposal;
          this.decorations = proposal
            ? Decoration.set(
                Decoration.widget({
                  widget: new GhostWord(proposal.value.word, proposal.context.distinct),
                  side: 1,
                }).range(proposal.context.at),
              )
            : Decoration.none;
        }

        update(update: ViewUpdate) {
          const invalidated =
            update.docChanged ||
            !update.startState.selection.eq(update.state.selection) ||
            update.focusChanged ||
            completionStatus(update.state) === 'active' ||
            update.transactions.some((tr) =>
              tr.effects.some((effect) => effect.is(refreshPrediction)),
            );
          if (invalidated) this.clear();
          for (const tr of update.transactions) {
            for (const effect of tr.effects) {
              if (effect.is(display)) this.setProposal(effect.value);
            }
          }
          if (
            !update.docChanged ||
            !update.transactions.some(
              (tr) => tr.isUserEvent('input.type') && !tr.isUserEvent('input.type.compose'),
            )
          )
            return;
          const captured = context(update.view, configuration());
          if (!captured) return;
          const generation = this.generation;
          this.timer = setTimeout(() => {
            const { language, projectPath, text } = captured;
            void request('predictWord', { language, projectPath, context: text })
              .then((value) => {
                if (
                  !value ||
                  value.epoch !== captured.epoch ||
                  generation !== this.generation ||
                  !this.current(update.view, captured)
                )
                  return;
                update.view.dispatch({ effects: display.of({ context: captured, value }) });
              })
              .catch(() => {});
          }, debounceMs);
        }

        private current(view: EditorView, captured: Context) {
          const now = context(view, configuration());
          return (
            now &&
            now.doc === captured.doc &&
            now.at === captured.at &&
            now.projectPath === captured.projectPath &&
            now.language === captured.language &&
            now.distinct === captured.distinct &&
            now.epoch === captured.epoch
          );
        }

        keydown(event: KeyboardEvent, view: EditorView) {
          if (!this.proposal || event.isComposing || view.compositionStarted) return false;
          const { context: captured, value } = this.proposal;
          const accepted = acceptsPredictionShortcut(event);
          if ((!accepted && event.key !== 'Escape') || !this.current(view, captured)) return false;
          event.preventDefault();
          if (accepted) {
            view.dispatch({
              changes: { from: captured.at, insert: value.word },
              selection: { anchor: captured.at + value.word.length },
              annotations: isolateHistory.of('full'),
              userEvent: 'input.complete',
              scrollIntoView: true,
            });
          } else {
            view.dispatch({ effects: refreshPrediction.of() });
          }
          void request('predictionFeedback', {
            projectPath: captured.projectPath,
            token: value.feedback,
            epoch: value.epoch,
            accepted,
          }).catch(() => {});
          return true;
        }

        invalidate(view: EditorView) {
          // compositionstart can arrive before CodeMirror's composing flag changes.
          this.generation++;
          clearTimeout(this.timer);
          queueMicrotask(() => {
            if (!this.proposal) return;
            view.dispatch({ effects: refreshPrediction.of() });
          });
          return false;
        }

        destroy() {
          this.clear();
        }
      },
      {
        decorations: (plugin) => plugin.decorations,
        eventHandlers: {
          keydown(event, view) {
            return this.keydown(event, view);
          },
          compositionstart(_event, view) {
            return this.invalidate(view);
          },
        },
      },
    ),
  );
}
