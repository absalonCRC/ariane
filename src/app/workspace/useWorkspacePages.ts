import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { InboxChange } from '../../contracts/inbox';
import type { EditorHandle } from '../../editor/types';
import { native } from '../../platform/client';
import { loadGlobalShortcut } from '../commands/shortcuts';
import type { Surface } from './types';

interface PagesInput {
  project: { path: string } | null;
  newProject: boolean;
  surface: Surface;
  historyMode: boolean;
  editor: RefObject<EditorHandle | null>;
  setSurface: (next: Surface) => void;
  close: () => void;
  select: (id: string) => Promise<boolean>;
  fail: (error: unknown) => void;
}
export function useWorkspacePages({
  project,
  newProject,
  surface,
  historyMode,
  editor,
  setSurface,
  close,
  select,
  fail,
}: PagesInput) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxSelection, setInboxSelection] = useState<string | null>(null);
  const resumeInbox = useRef(false);
  const pageSurface =
    surface === 'profile' ||
    surface === 'preferences' ||
    surface === 'tags' ||
    surface === 'entities'
      ? surface
      : null;
  const pageActive = !!project && !newProject && (!!pageSurface || inboxOpen);
  const [pageHost, setPageHost] = useState<HTMLElement | null>(null);
  const pageReturnFocus = useRef<HTMLElement | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const pageBusyRef = useRef(false);
  pageBusyRef.current = pageBusy;
  const pageHostContext = useMemo(
    () => ({ target: pageHost, returnFocus: pageReturnFocus, onBusy: setPageBusy }),
    [pageHost],
  );
  const closePage = () => {
    if (pageBusy) return;
    setInboxOpen(false);
    if (pageSurface) close();
  };
  const selectFromChrome = (id: string) => {
    if (pageBusy) return;
    closePage();
    void select(id);
  };
  useLayoutEffect(() => {
    if (pageActive || !pageReturnFocus.current) return;
    const previous = pageReturnFocus.current;
    pageReturnFocus.current = null;
    const current = document.activeElement;
    if (
      current !== document.body &&
      current instanceof HTMLElement &&
      !current.closest('.workspace-page')
    )
      return;
    const destination =
      previous !== document.body && previous.isConnected && !previous.closest('[hidden], [inert]')
        ? previous
        : editor.current;
    if (destination instanceof HTMLElement) destination.focus({ preventScroll: true });
    else destination?.focus();
  }, [pageActive]);
  useEffect(() => {
    if (surface !== 'none') setInboxOpen(false);
  }, [surface]);
  useEffect(() => {
    if (historyMode) setInboxOpen(false);
  }, [historyMode]);
  useEffect(() => {
    const open = () => {
      if (pageBusyRef.current) return;
      setSurface('none');
      setInboxOpen(true);
    };
    window.addEventListener('ariane-inbox-open', open);
    let active = true;
    const cleanups: (() => void)[] = [];
    const add = (fn: () => void) => {
      if (active) cleanups.push(fn);
      else fn();
    };
    if (native)
      void import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          add(
            await listen<string>('app-command', (e) => {
              if (e.payload === 'inbox-open') open();
            }),
          );
          add(
            await listen<InboxChange>('inbox-changed', (e) => {
              if (e.payload.kind === 'preferences' || e.payload.kind === 'restore')
                void loadGlobalShortcut().catch(fail);
            }),
          );
        })
        .catch(fail);
    if (native) void loadGlobalShortcut().catch(fail);
    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
      window.removeEventListener('ariane-inbox-open', open);
    };
  }, []);
  useEffect(() => {
    if (resumeInbox.current && !newProject && project) {
      resumeInbox.current = false;
      setInboxOpen(true);
    }
  }, [newProject, project?.path]);
  return {
    pageActive,
    pageSurface,
    pageBusy,
    pageHostContext,
    setPageHost,
    closePage,
    selectFromChrome,
    inboxOpen,
    setInboxOpen,
    inboxSelection,
    setInboxSelection,
    resumeAfterCreation: () => {
      resumeInbox.current = true;
      setInboxOpen(false);
    },
  };
}
