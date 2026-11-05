import type { NoteRef } from '../contracts/notes';
import { setNoteLinkData } from './noteLinks';
import { Prec, type EditorState } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import {
  autocompletion,
  acceptCompletion,
  closeCompletion,
  completionStatus,
  pickedCompletion,
  type Completion,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { t } from '../i18n';

export interface NoteTrigger {
  from: number;
  to: number;
  query: string;
  create: boolean;
}
export function noteTrigger(state: EditorState): NoteTrigger | null {
  if (state.readOnly || !state.selection.main.empty) return null;
  const to = state.selection.main.head;
  const line = state.doc.lineAt(to);
  const before = state.sliceDoc(line.from, to);
  const match = /(?:^|[\s(])(@|\+ ?)([\p{L}\p{N}_'’ .-]{0,120})$/u.exec(before);
  if (!match || (match[2] && !/\p{L}/u.test(match[2]))) return null;
  const from = to - match[1].length - match[2].length;
  let node = syntaxTree(state).resolveInner(from, 1);
  for (;;) {
    if (/Code|Link|URL|HTML/.test(node.name)) return null;
    if (!node.parent) break;
    node = node.parent;
  }
  const create = match[1].startsWith('+');
  if (create) {
    if (/[\d=]\s*$/.test(state.sliceDoc(line.from, from))) return null;
    // A continuation of an existing Markdown list keeps normal Enter behavior.
    if (line.number > 1 && /^\s*(?:[-+*]|\d+[.)])\s/.test(state.doc.line(line.number - 1).text))
      return null;
  }
  return { from, to, query: match[2].trim(), create };
}
export function noteContext(state: EditorState, trigger: NoteTrigger) {
  const line = state.doc.lineAt(trigger.from);
  const text = (
    state.sliceDoc(line.from, trigger.from) +
    trigger.query +
    state.sliceDoc(trigger.to, line.to)
  )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
  return text === trigger.query ? '' : Array.from(text).slice(0, 1000).join('');
}
export function noteLink(note: NoteRef) {
  const label = note.title.replace(/[\\[\]]/g, '\\$&');
  return `[${label}](ariane://source/${encodeURIComponent(note.id)})`;
}
export function noteCommands(options: {
  additionalCompletions?: CompletionSource[];
  lookup: (query: string) => Promise<NoteRef[]>;
  create: (name: string, context: string) => Promise<NoteRef>;
  isCurrent: (view: EditorView) => boolean;
  onError: (error: unknown) => void;
}) {
  const busy = new WeakSet<EditorView>();
  const dismissed = new WeakMap<EditorView, { from: number; to: number }>();
  const insert = (
    view: EditorView,
    note: NoteRef,
    trigger: NoteTrigger,
    completion?: Completion,
  ) => {
    const text = noteLink(note) + ' ';
    view.dispatch({
      changes: { from: trigger.from, to: trigger.to, insert: text },
      selection: { anchor: trigger.from + text.length },
      effects: setNoteLinkData.of({ notes: [note] }),
      annotations: completion ? pickedCompletion.of(completion) : [],
      userEvent: 'input.complete',
    });
    closeCompletion(view);
    view.focus();
  };
  const apply = async (view: EditorView, note?: NoteRef, completion?: Completion) => {
    const trigger = noteTrigger(view.state);
    if (!trigger || busy.has(view)) return;
    if (note) {
      insert(view, note, trigger, completion);
      return;
    }
    const doc = view.state.doc;
    busy.add(view);
    try {
      const found = trigger.create
        ? await options.create(trigger.query, noteContext(view.state, trigger))
        : (await options.lookup(trigger.query))[0];
      if (!options.isCurrent(view)) return;
      if (
        view.state.doc !== doc ||
        view.state.selection.main.head !== trigger.to ||
        view.state.readOnly
      ) {
        if (trigger.create)
          options.onError(t('La note a été créée. Le texte a changé ; retrouvez-la avec @.'));
        return;
      }
      if (found) insert(view, found, trigger, completion);
      else options.onError(t('Aucune note trouvée. Utilisez + suivi du nom pour la créer.'));
    } catch (e) {
      if (options.isCurrent(view)) options.onError(e);
    } finally {
      busy.delete(view);
    }
  };
  return [
    autocompletion({
      activateOnTypingDelay: 120,
      defaultKeymap: true,
      override: [
        ...(options.additionalCompletions ?? []),
        async (context) => {
          const trigger = noteTrigger(context.state);
          if (!trigger) return null;
          try {
            const notes = await options.lookup(trigger.query);
            if (context.aborted) return null;
            const completions: Completion[] = notes.map((note) => ({
              label: note.title,
              detail: `${note.kind} · ${note.path}`,
              type: 'text',
              apply: (view, completion) => {
                void apply(view, note, completion);
              },
            }));
            if (trigger.create && trigger.query)
              completions.unshift({
                label: t('Créer « {0} »', { 0: trigger.query }),
                detail: t('Note dans le vault du projet'),
                type: 'text',
                info: t('Entrée : valider · Échap : conserver le texte'),
                apply: (view, completion) => {
                  void apply(view, undefined, completion);
                },
              });
            return { from: trigger.from, to: trigger.to, options: completions, filter: false };
          } catch (e) {
            if (!context.aborted) options.onError(e);
            return null;
          }
        },
      ],
    }),
    Prec.highest(
      keymap.of([
        {
          key: 'Escape',
          run: (view) => {
            const trigger = noteTrigger(view.state);
            if (!trigger) return false;
            dismissed.set(view, { from: trigger.from, to: trigger.to });
            closeCompletion(view);
            return true;
          },
        },
        {
          key: 'Enter',
          run: (view) => {
            const trigger = noteTrigger(view.state);
            if (!trigger || !trigger.query || view.composing) return false;
            const ignored = dismissed.get(view);
            if (ignored?.from === trigger.from && ignored.to === trigger.to) return false;
            if (busy.has(view)) return true;
            if (completionStatus(view.state) === 'active' && acceptCompletion(view)) return true;
            void apply(view);
            return true;
          },
        },
      ]),
    ),
  ];
}
