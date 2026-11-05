import type { NoteActivityController } from '../notes/useNoteActivity';
import type { Project } from '../contracts/project';
import type { Dispatch, SetStateAction } from 'react';
import type { ProjectController } from '../project/useProject';
import { useCallback, useEffect, useRef } from 'react';
import { request } from '../platform/client';
export interface NoteCreationInput {
  activity?: Pick<NoteActivityController, 'record'>;
  p: Project | null;
  setSourceVersion: Dispatch<SetStateAction<number>>;
  fail: (e: unknown) => void;
  doc: ProjectController;
}

/** Insert the note immediately, then classify it while the author is idle. */
export function useNoteCreation(workspace: NoteCreationInput) {
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
    const source = await request('createQuickNote', { projectPath: path, name, context });
    const current = () => epoch === generation.current && latest.current.p?.path === path;
    if (!current()) return source;
    void latest.current.activity?.record({
      kind: 'created',
      title: source.title,
      sourceId: source.id,
    });
    latest.current.setSourceVersion((v) => v + 1);
    const run = async () => {
      if (!current()) return;
      try {
        const result = await request('classifyCreatedNote', {
          projectPath: path,
          id: source.id,
          context,
        });
        if (!current()) return;
        if (result.pending) schedule();
        else if (result.source) {
          void latest.current.activity?.record({
            kind: 'classified',
            title: result.source.title,
            sourceId: source.id,
          });
          latest.current.setSourceVersion((v) => v + 1);
        }
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
