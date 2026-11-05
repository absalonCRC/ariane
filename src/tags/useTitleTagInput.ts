import { useEffect, useRef, useState } from 'react';
import type { SmartTag } from '../contracts/smartTags';
export interface TitleTagInput {
  tags: SmartTag[];
  create: (name: string) => Promise<SmartTag>;
  assign: (id: string) => Promise<void>;
  open: (id: string) => void;
  remove?: (id: string) => void | Promise<void>;
  removalLabel?: (id: string) => string;
  onError: (error: unknown) => void;
  onPending?: (task: Promise<void>) => void;
  registerFlusher?: (flush: () => Promise<void>) => () => void;
}
/** The title owns its draft; asynchronous tag creation never replaces newer typing. */
export function useTitleTagInput(
  title: string,
  readOnly: boolean,
  onCommit: (value: string) => void | Promise<void>,
  tags?: TitleTagInput,
) {
  const [value, setValue] = useState(title),
    input = useRef<HTMLInputElement>(null);
  const current = useRef(title),
    previousTitle = useRef(title),
    alive = useRef(true),
    composing = useRef(false),
    dismissed = useRef('');
  const latest = useRef({ title, readOnly, onCommit, tags });
  latest.current = { title, readOnly, onCommit, tags };
  type Job = { from: number; to: number; raw: string; cancelled: boolean };
  const jobs = useRef(new Set<Job>()),
    pending = useRef(new Set<Promise<void>>());
  const committed = useRef<{ value: string; task: Promise<void> } | null>(null);
  useEffect(() => {
    if (current.current === previousTitle.current || document.activeElement !== input.current) {
      current.current = title;
      setValue(title);
    }
    previousTitle.current = title;
  }, [title]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const job of jobs.current) job.cancelled = true;
    };
  }, []);
  function change(next: string) {
    const old = current.current;
    let from = 0,
      suffix = 0;
    while (from < old.length && from < next.length && old[from] === next[from]) from++;
    while (
      suffix < old.length - from &&
      suffix < next.length - from &&
      old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
    )
      suffix++;
    const to = old.length - suffix,
      delta = next.length - old.length;
    for (const job of jobs.current) {
      if (from < job.to && to > job.from) job.cancelled = true;
      if (job.from >= to) job.from += delta;
      if (job.to > to) job.to += delta;
    }
    current.current = next;
    setValue(next);
  }
  async function commit() {
    const next = current.current.trim();
    if (latest.current.readOnly || !next || next === latest.current.title) return;
    if (committed.current?.value === next) return committed.current.task;
    const task = Promise.resolve().then(() => latest.current.onCommit(next));
    const entry = { value: next, task };
    committed.current = entry;
    try {
      await task;
    } catch (error) {
      if (committed.current === entry) committed.current = null;
      throw error;
    }
  }
  function scan(finish = false) {
    const options = latest.current.tags;
    if (
      !options ||
      latest.current.readOnly ||
      composing.current ||
      current.current === dismissed.current
    )
      return;
    const text = current.current;
    for (const match of text.matchAll(
      /(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_'’\-]{0,79})(?=$|[\s.,;:!?)}\]])/gu,
    )) {
      const name = match[1],
        from = match.index + match[0].length - name.length - 1,
        to = from + name.length + 1;
      if (
        (!finish && to === text.length) ||
        jobs.current.size >= 64 ||
        [...jobs.current].some((job) => !job.cancelled && job.from === from)
      )
        continue;
      const job = { from, to, raw: text.slice(from, to), cancelled: false };
      jobs.current.add(job);
      const task = (async () => {
        try {
          await Promise.resolve();
          if (!alive.current || job.cancelled) return;
          const tag = await options.create(name);
          if (
            !alive.current ||
            job.cancelled ||
            current.current.slice(job.from, job.to) !== job.raw
          )
            return;
          await options.assign(tag.id);
          if (
            !alive.current ||
            job.cancelled ||
            current.current.slice(job.from, job.to) !== job.raw
          )
            return;
          const end = job.to + Number(current.current[job.to] === ' '),
            element = input.current;
          const selection =
            element && document.activeElement === element
              ? { start: element.selectionStart ?? end, end: element.selectionEnd ?? end }
              : null;
          const map = (pos: number) =>
            pos <= job.from ? pos : pos >= end ? pos - (end - job.from) : job.from;
          change(current.current.slice(0, job.from) + current.current.slice(end));
          if (selection)
            requestAnimationFrame(() => {
              if (alive.current && document.activeElement === element)
                element!.setSelectionRange(map(selection.start), map(selection.end));
            });
        } catch (error) {
          if (alive.current) options.onError(error);
        } finally {
          jobs.current.delete(job);
        }
      })();
      pending.current.add(task);
      void task.then(() => {
        pending.current.delete(task);
        if (alive.current && !pending.current.size) void commit().catch(options.onError);
      });
      options.onPending?.(task);
    }
  }
  async function flush() {
    scan(true);
    while (pending.current.size) await Promise.all(pending.current);
    await commit();
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => tags?.registerFlusher?.(() => flushRef.current()), [tags?.registerFlusher]);
  return {
    value,
    input,
    change: (next: string) => {
      change(next);
      scan();
    },
    blur: () => {
      void flush()
        .then(() => {
          if (alive.current && !current.current.trim()) change(latest.current.title);
        })
        .catch((error) => latest.current.tags?.onError(error));
    },
    dismiss: () => {
      dismissed.current = current.current;
    },
    composition: (active: boolean) => {
      composing.current = active;
      if (!active) scan();
    },
  };
}
