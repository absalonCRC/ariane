import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { request } from '../platform/client';
import type { NoteEvent, NoteEventInput, NoteAction } from '../contracts/noteActivity';
export const noteActionLabels: Record<NoteAction, string> = {
  detected: 'Note détectée',
  suggested: 'Note suggérée',
  opened: 'Note ouverte',
  consulted: 'Consultation ouverte',
  created: 'Note créée',
  classified: 'Note classée',
  associated: 'Note associée',
  cited: 'Note citée',
  pinned: 'Note épinglée',
  unpinned: 'Note détachée',
  updated: 'Note modifiée',
  resolved: 'Note identifiée',
  dismissed: 'Suggestion masquée',
};
export function noteEventLabel(event: Pick<NoteEventInput, 'kind' | 'title'>) {
  return `${t(noteActionLabels[event.kind])} · ${event.title}`;
}
export function useNoteActivity(path: string | undefined) {
  const [items, setItems] = useState<NoteEvent[]>([]),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [latest, setLatest] = useState<NoteEvent | null>(null);
  const current = useRef(path);
  current.current = path;
  const queue = useRef(Promise.resolve());
  const failed = useRef<{ path: string; value: NoteEventInput }[]>([]);
  const pendingKeys = useRef(new Set<string>());
  const merge = useCallback(
    (events: NoteEvent[]) =>
      setItems((old) =>
        [...new Map([...old, ...events].map((e) => [e.id, e])).values()].sort(
          (a, b) => b.id - a.id,
        ),
      ),
    [],
  );
  const load = useCallback(
    async (before?: number) => {
      if (!path) return;
      setLoading(true);
      try {
        const page = await request('noteActivity', { projectPath: path, before });
        if (current.current !== path) return;
        if (!Array.isArray(page?.items)) throw new Error('Historique des notes indisponible.');
        merge(page.items);
        setHasMore(page.hasMore);
        setError('');
      } catch (e) {
        if (current.current === path) setError(String(e));
      } finally {
        if (current.current === path) setLoading(false);
      }
    },
    [path, merge],
  );
  useEffect(() => {
    setItems([]);
    setLatest(null);
    setError('');
    setHasMore(false);
    void load();
  }, [load]);
  const record = useCallback(
    (input: NoteEventInput) => {
      const value = { ...input, dedupKey: input.dedupKey ?? `action:${crypto.randomUUID()}` };
      if (!path) return Promise.resolve();
      const key = value.dedupKey ? JSON.stringify([path, value.dedupKey]) : null;
      if (key && pendingKeys.current.has(key)) return queue.current;
      if (key) pendingKeys.current.add(key);
      const operation = queue.current.then(async () => {
        const result = await request('recordNoteActivity', { projectPath: path, value });
        if (current.current !== path) return;
        merge([result.event]);
        if (result.inserted) setLatest(result.event);
      });
      queue.current = operation.catch((e) => {
        failed.current.push({ path, value });
        if (key) pendingKeys.current.delete(key);
        if (current.current === path) setError(String(e));
      });
      return queue.current;
    },
    [path, merge],
  );
  const retry = useCallback(async () => {
    await queue.current;
    const entries = failed.current.splice(0);
    for (const entry of entries) {
      try {
        const result = await request('recordNoteActivity', {
          projectPath: entry.path,
          value: entry.value,
        });
        if (current.current === entry.path) {
          merge([result.event]);
          if (result.inserted) setLatest(result.event);
        }
      } catch (e) {
        failed.current.push(entry);
        if (current.current === entry.path) setError(String(e));
      }
    }
    if (!failed.current.length) setError('');
  }, [merge]);
  const flush = useCallback(async () => {
    await retry();
    if (failed.current.length) throw new Error('Un événement de note n’a pas pu être enregistré.');
  }, [retry]);
  return {
    items,
    latest,
    error,
    loading,
    hasMore,
    record,
    flush,
    retry: async () => {
      await retry();
      await load();
    },
    loadMore: () => load(items.at(-1)?.id),
  };
}
export type NoteActivityController = ReturnType<typeof useNoteActivity>;
