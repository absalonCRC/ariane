import { Prec, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  autocompletion,
  acceptCompletion,
  closeCompletion,
  completionStatus,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { EditorView, ViewPlugin, keymap, type ViewUpdate } from '@codemirror/view';
import type { SmartTag } from '../contracts/smartTags';
import type { OutlineEditor } from './outline/state';
import { t } from '../i18n';
interface Trigger {
  from: number;
  to: number;
  query: string;
}
function allowed(state: EditorState, from: number) {
  for (let node = syntaxTree(state).resolveInner(from, 1); node; node = node.parent!)
    if (/Code|Link|URL|HTML/.test(node.name)) return false;
  return true;
}
export function tagTrigger(state: EditorState): Trigger | null {
  if (state.readOnly || !state.selection.main.empty) return null;
  const to = state.selection.main.head,
    line = state.doc.lineAt(to);
  const match = /(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_'’\-]{0,79})?$/u.exec(
    state.sliceDoc(line.from, to),
  );
  if (!match) return null;
  const query = match[1] ?? '',
    from = to - query.length - 1;
  return allowed(state, from) ? { from, to, query } : null;
}
export function smartTagInput(
  outline: OutlineEditor,
  options: {
    tags: () => SmartTag[];
    create: (name: string) => Promise<SmartTag>;
    isCurrent: (view: EditorView) => boolean;
    onError: (error: unknown) => void;
    onPending?: (task: Promise<void>) => void;
    standalone: boolean;
  },
) {
  type Job = Trigger & { node: string; raw: string; cancelled: boolean };
  const jobs = new Set<Job>();
  const pending = new Set<Promise<void>>();
  const dismissed = new WeakMap<EditorView, string>();
  let active = true;
  const apply = async (view: EditorView, trigger: Trigger, tag?: SmartTag, automatic = true) => {
    if (
      (!trigger.query && !tag) ||
      view.state.readOnly ||
      view.composing ||
      jobs.size >= 64 ||
      [...jobs].some((j) => j.from === trigger.from && !j.cancelled)
    )
      return;
    const node = outline.entryAt(view.state, trigger.from);
    const job: Job = {
      ...trigger,
      node: node.id,
      raw: view.state.sliceDoc(trigger.from, trigger.to),
      cancelled: false,
    };
    jobs.add(job);
    try {
      // Always leave the current CodeMirror update before publishing metadata.
      await Promise.resolve();
      tag ??=
        options.tags().find((t) => t.name.toLowerCase() === trigger.query.toLowerCase()) ??
        (await options.create(trigger.query));
      if (!active || !options.isCurrent(view) || view.state.readOnly || view.composing) return;
      const owner = outline.index(view.state).byId.get(job.node);
      if (job.cancelled || !owner || view.state.sliceDoc(job.from, job.to) !== job.raw) {
        if (!automatic) options.onError(t('Le texte a changé. Saisissez à nouveau le smart-tag.'));
        return;
      }
      const to = job.to + Number(view.state.sliceDoc(job.to, job.to + 1) === ' ');
      outline.setTags(
        view,
        owner.id,
        [...(owner.tagIds ?? []), tag.id],
        { from: job.from, to, insert: '' },
        true,
      );
      closeCompletion(view);
    } catch (error) {
      if (active && options.isCurrent(view)) options.onError(error);
    } finally {
      jobs.delete(job);
    }
  };
  const source: CompletionSource = (context) => {
    const trigger = tagTrigger(context.state);
    if (!trigger) return null;
    return {
      from: trigger.from,
      to: trigger.to,
      filter: false,
      options: options
        .tags()
        .filter((t) => t.name.toLowerCase().includes(trigger.query.toLowerCase()))
        .map((tag) => ({
          label: '#' + tag.name,
          detail: tag.category,
          type: 'keyword',
          apply: (view: EditorView) => {
            const current = tagTrigger(view.state);
            if (current) enqueue(view, current, tag, false);
          },
        })),
    };
  };
  const enqueue = (view: EditorView, trigger: Trigger, tag?: SmartTag, automatic = true) => {
    const task = apply(view, trigger, tag, automatic);
    pending.add(task);
    void task.then(() => pending.delete(task));
    options.onPending?.(task);
    return task;
  };
  const automatic = ViewPlugin.fromClass(
    class {
      constructor() {
        active = true;
      }
      destroy() {
        active = false;
        for (const job of jobs) job.cancelled = true;
      }
      update(u: ViewUpdate) {
        if (!u.docChanged) return;
        for (const job of jobs) {
          u.changes.iterChangedRanges((from, to) => {
            if (from < job.to && to > job.from) job.cancelled = true;
          });
          job.from = u.changes.mapPos(job.from, 1);
          job.to = u.changes.mapPos(job.to, -1);
        }
        if (
          u.state.readOnly ||
          u.view.composing ||
          !u.transactions.some((tr) => tr.isUserEvent('input') && !tr.isUserEvent('input.smartTag'))
        )
          return;
        const lines = new Set<number>();
        u.changes.iterChangedRanges((_a, _b, from, to) => {
          for (
            let n = u.state.doc.lineAt(from).number;
            n <= u.state.doc.lineAt(to).number && lines.size < 500;
            n++
          )
            lines.add(n);
        });
        for (const number of lines) {
          const line = u.state.doc.line(number);
          for (const match of line.text.matchAll(
            /(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_'’\-]{0,79})(?=$|[\s.,;:!?)}\]])/gu,
          )) {
            const query = match[1],
              from = line.from + match.index + match[0].length - query.length - 1,
              to = from + query.length + 1;
            if (
              to === u.state.doc.length ||
              !allowed(u.state, from) ||
              dismissed.get(u.view) === `${from}:${to}`
            )
              continue;
            enqueue(u.view, { from, to, query });
          }
        }
      }
    },
  );
  return {
    source,
    async flush(view: EditorView) {
      const trigger = tagTrigger(view.state);
      if (trigger?.query && dismissed.get(view) !== `${trigger.from}:${trigger.to}`)
        enqueue(view, trigger);
      while (pending.size) await Promise.all(pending);
    },
    extensions: [
      ...(options.standalone
        ? [autocompletion({ override: [source], activateOnTypingDelay: 120 })]
        : []),
      automatic,
      EditorView.domEventHandlers({
        blur(_event, view) {
          const trigger = tagTrigger(view.state);
          if (trigger?.query && dismissed.get(view) !== `${trigger.from}:${trigger.to}`)
            enqueue(view, trigger);
          return false;
        },
      }),
      Prec.highest(
        keymap.of([
          {
            key: 'Escape',
            run: (view) => {
              const trigger = tagTrigger(view.state);
              if (!trigger) return false;
              dismissed.set(view, `${trigger.from}:${trigger.to}`);
              closeCompletion(view);
              return true;
            },
          },
          {
            key: 'Enter',
            run: (view) => {
              const trigger = tagTrigger(view.state);
              if (
                !trigger ||
                view.composing ||
                dismissed.get(view) === `${trigger.from}:${trigger.to}`
              )
                return false;
              const exact = options
                .tags()
                .some((t) => t.name.toLowerCase() === trigger.query.toLowerCase());
              if (!exact && completionStatus(view.state) === 'active' && acceptCompletion(view))
                return true;
              if (trigger.query) enqueue(view, trigger);
              return false;
            },
          },
        ]),
      ),
    ],
  };
}
