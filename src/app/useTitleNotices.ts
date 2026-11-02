import { useCallback, useEffect, useRef, useState } from 'react';
import { useContextMenuNotice } from '../components/ContextMenu';
import type { Workspace } from './useWorkspace';

type NoticeKind = 'library' | 'error' | 'recovery' | 'export' | 'context';
type NoticeTone = 'success' | 'info' | 'error';

export type TitleNotice = {
  id: number;
  kind: NoticeKind;
  message: string;
  tone: NoticeTone;
  libraryNotice?: Workspace['libraryNotice'];
};

const NOTICE_DURATION = 5000;

// Informational notices expire independently; errors stay until dismissed or retried.
export function useTitleNotices(workspace: Workspace) {
  const contextNotice = useContextMenuNotice();
  const [notices, setNotices] = useState<TitleNotice[]>([]);
  const serial = useRef(0);
  const timers = useRef(new Map<number, { timer: number | null; kind: NoticeKind }>());
  const projectPath = workspace.p?.path;
  const previousProjectPath = useRef(projectPath);
  const { error, recovery, libraryNotice, surface, exportJob, setLibraryNotice, setError } =
    workspace;

  const dismiss = useCallback(
    (notice: TitleNotice) => {
      const entry = timers.current.get(notice.id);
      if (entry?.timer != null) window.clearTimeout(entry.timer);
      timers.current.delete(notice.id);
      if (notice.kind === 'library') {
        setLibraryNotice((current) => (current === notice.libraryNotice ? null : current));
      }
      if (notice.kind === 'error') setError('');
      if (notice.kind === 'context') contextNotice.clear();
      setNotices((previous) => previous.filter((item) => item.id !== notice.id));
    },
    [setLibraryNotice, setError, contextNotice.clear],
  );
  const enqueue = useCallback(
    (kind: NoticeKind, message: string, tone: NoticeTone, library?: Workspace['libraryNotice']) => {
      const notice: TitleNotice = {
        id: ++serial.current,
        kind,
        message,
        tone,
        libraryNotice: library,
      };
      if (kind !== 'library') {
        for (const [id, entry] of timers.current) {
          if (entry.kind === kind) {
            if (entry.timer !== null) window.clearTimeout(entry.timer);
            timers.current.delete(id);
          }
        }
      }
      const timer =
        tone === 'error' ? null : window.setTimeout(() => dismiss(notice), NOTICE_DURATION);
      timers.current.set(notice.id, { timer, kind });
      setNotices((previous) => {
        const remaining =
          kind === 'library' ? previous : previous.filter((item) => item.kind !== kind);
        return kind === 'error' ? [notice, ...remaining] : [...remaining, notice];
      });
    },
    [dismiss],
  );
  const removeKind = useCallback((kind: NoticeKind) => {
    for (const [id, entry] of timers.current) {
      if (entry.kind === kind) {
        if (entry.timer !== null) window.clearTimeout(entry.timer);
        timers.current.delete(id);
      }
    }
    setNotices((previous) => {
      const next = previous.filter((item) => item.kind !== kind);
      return next.length === previous.length ? previous : next;
    });
  }, []);

  useEffect(
    () => () => {
      for (const { timer } of timers.current.values())
        if (timer !== null) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );
  useEffect(() => {
    if (previousProjectPath.current === projectPath) return;
    previousProjectPath.current = projectPath;
    for (const { timer } of timers.current.values()) if (timer !== null) window.clearTimeout(timer);
    timers.current.clear();
    setNotices([]);
  }, [projectPath]);

  useEffect(() => {
    if (libraryNotice) enqueue('library', libraryNotice.message, 'success', libraryNotice);
  }, [libraryNotice, enqueue]);

  useEffect(() => {
    if (error)
      enqueue(
        'error',
        error.startsWith('EXTERNAL:') ? 'Ce texte a été modifié ailleurs.' : error,
        'error',
      );
    else removeKind('error');
  }, [error, enqueue, removeKind]);

  useEffect(() => {
    if (recovery) enqueue('recovery', 'Votre texte a été récupéré.', 'success');
    else removeKind('recovery');
  }, [recovery, enqueue, removeKind]);

  useEffect(() => {
    if (surface === 'export' || exportJob.state === 'ready') {
      removeKind('export');
      return;
    }
    enqueue(
      'export',
      exportJob.state === 'working'
        ? 'Export en cours…'
        : exportJob.state === 'done'
          ? 'Votre manuscrit est prêt.'
          : 'L’export n’a pas abouti.',
      exportJob.state === 'error' ? 'error' : exportJob.state === 'done' ? 'success' : 'info',
    );
  }, [surface, exportJob.state, enqueue, removeKind]);

  useEffect(() => {
    if (contextNotice.message) enqueue('context', contextNotice.message, 'error');
    else removeKind('context');
  }, [contextNotice.message, enqueue, removeKind]);

  return {
    notices,
    dismiss,
    hasPending: !!error || recovery || (surface !== 'export' && exportJob.state !== 'ready'),
    hasError: !!error || (surface !== 'export' && exportJob.state === 'error'),
  };
}
