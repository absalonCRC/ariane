import { useCallback, useEffect, useRef } from 'react';
import { request } from '../app/client';
import type { Source } from '../app/types';
import type { Workspace } from '../app/useWorkspace';

/** Insert the note immediately, then classify it while the author is idle. */
export function useNoteCreation(workspace: Workspace) {
  const latest = useRef(workspace);
  latest.current = workspace;
  const generation = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      generation.current++;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    [workspace.p?.path],
  );
  return useCallback(async (name: string, context: string) => {
    const path = latest.current.p?.path;
    if (!path) throw new Error('Ouvrez un projet pour continuer.');
    const epoch = generation.current;
    const source = await request<Source>('createQuickNote', { projectPath: path, name });
    const current = () => epoch === generation.current && latest.current.p?.path === path;
    if (!current()) return source;
    latest.current.setSourceVersion((v) => v + 1);
    const run = async () => {
      if (!current()) return;
      try {
        const result = await request<{ pending?: boolean; source?: Source }>(
          'classifyCreatedNote',
          { projectPath: path, id: source.id, context },
        );
        if (!current()) return;
        if (result.pending) schedule();
        else if (result.source) latest.current.setSourceVersion((v) => v + 1);
      } catch (e) {
        if (current()) latest.current.fail(e);
      }
    };
    const schedule = () => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        void run();
      }, 1200);
      timers.current.add(timer);
    };
    if (
      source.kind.toLowerCase() === 'note' &&
      latest.current.doc.settings.classifyNewNotes !== false
    )
      schedule();
    return source;
  }, []);
}
