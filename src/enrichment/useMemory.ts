import type { PanelOrigin } from '../components/useSharedPanel';
import { useEffect, useRef, useState } from 'react';
import { native, request } from '../app/client';
import type { Workspace } from '../app/useWorkspace';

export interface MemoryPosition {
  section: string;
  node: string | null;
  offset: number;
  cursor: number;
}
export interface MemoryPassage {
  id?: string;
  section: string;
  node: string | null;
  title: string;
  quote: string;
  hash: string;
  score?: number;
}
export interface MemoryEntity {
  id: string;
  title: string;
  kind: string;
  passageCount?: number;
}
export interface Evidence {
  id: string;
  hash: string;
  title: string;
  sourceId: string;
  fingerprint: string;
  page: number | null;
  quote: string;
  reason: string;
}
export interface MemoryResult {
  entities: MemoryEntity[];
  recall: MemoryPassage | null;
  evidence?: Evidence | null;
  anchorHash: string;
  analyzed?: number;
  pending?: boolean;
  busy?: boolean;
  deferred?: boolean;
  stale?: boolean;
  modelError?: string | null;
}
export interface SessionContext extends MemoryPosition {
  sourceId?: string | null;
  sourcePage?: number | null;
  recent: { section: string; node: string | null }[];
}
export type MemoryView =
  | { kind: 'entity'; id: string }
  | { kind: 'recall'; passage: MemoryPassage }
  | { kind: 'evidence'; evidence: Evidence }
  | { kind: 'resume' }
  | { kind: 'list' };

export function useMemory(workspace: Workspace) {
  const { doc, editor, p } = workspace;
  const [result, setResult] = useState<MemoryResult | null>(null);
  const [anchor, setAnchor] = useState<MemoryPosition | null>(null);
  const [origin, setOrigin] = useState<PanelOrigin | null>(null);
  const [view, setView] = useState<MemoryView | null>(null);
  const [resume, setResume] = useState<SessionContext | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const latest = useRef(workspace);
  latest.current = workspace;
  const activeView = useRef(view);
  activeView.current = view;
  const epoch = useRef(0);
  const typing = useRef(false);
  const loaded = useRef<string | null>(null);
  const session = useRef<SessionContext | null>(null);
  const restoring = useRef<SessionContext | null>(null);
  const inFlight = useRef(false);
  const entitiesInFlight = useRef(false);
  const [entityError, setEntityError] = useState('');

  function activity(active: boolean) {
    if (native) void request('memoryActivity', { active }).catch(() => {});
  }
  function onTyping() {
    epoch.current++;
    if (!typing.current) {
      typing.current = true;
      activity(true);
    }
    setShowResume(false);
    // Results derived from the edited passage must never look current.
    setResult((value) => (value ? null : value));
  }
  async function saveSession() {
    const w = latest.current;
    const path = w.doc.ref.current?.path;
    if (!native || !path || loaded.current !== path) return;
    if (restoring.current && !typing.current) return;
    const position = w.editor.current?.context();
    if (!position) return;
    const recent = [position, ...(session.current?.recent ?? [])]
      .filter(
        (v, i, all) => all.findIndex((x) => x.section === v.section && x.node === v.node) === i,
      )
      .slice(0, 3)
      .map(({ section, node }) => ({ section, node }));
    session.current = { ...session.current, ...position, recent };
    await request('memorySession', { projectPath: path, value: session.current });
  }
  workspace.memorySessionSaver.current = saveSession;

  useEffect(() => {
    epoch.current++;
    const start = epoch.current;
    let alive = true;
    loaded.current = null;
    session.current = null;
    restoring.current = null;
    typing.current = false;
    setResult(null);
    setAnchor(null);
    setView(null);
    setOrigin(null);
    setResume(null);
    setShowResume(false);
    setError('');
    setEntityError('');
    activity(true);
    if (native && p?.path) {
      void request<SessionContext>('memorySession', { projectPath: p.path })
        .then((value) => {
          if (!alive) return;
          loaded.current = p.path;
          session.current = value;
          if (value?.section) {
            setResume(value);
            setShowResume(epoch.current === start);
            if (epoch.current === start) restoring.current = value;
          }
        })
        .catch(() => {
          if (alive) loaded.current = p.path;
        });
    }
    return () => {
      alive = false;
      activity(true);
    };
  }, [p?.path]);

  useEffect(() => {
    const value = restoring.current;
    if (!value || typing.current) return;
    if (editor.current?.restoreContext(value)) restoring.current = null;
  }, [resume, workspace.active, doc.generation, workspace.viewport?.cursor]);

  useEffect(() => {
    if (workspace.reader && session.current) {
      session.current = {
        ...session.current,
        sourceId: workspace.reader.id,
        sourcePage: workspace.reader.page,
      };
    }
  }, [workspace.reader?.id, workspace.reader?.page]);

  useEffect(() => {
    if (doc.status !== 'saved' || recording) {
      activity(true);
      return;
    }
    let alive = true;
    setResult(null);
    let timer: ReturnType<typeof setTimeout>;
    let entityTimer: ReturnType<typeof setTimeout>;
    const path = p?.path;
    const run = async (semantic = false) => {
      if (!alive || !native || !path) return;
      typing.current = false;
      activity(false);
      const position = latest.current.editor.current?.context();
      if (!position) return;
      if (!doc.settings.enrichment) return;
      if (inFlight.current) {
        timer = setTimeout(() => void run(semantic), 250);
        return;
      }
      const section = latest.current.doc.ref.current?.sections.find(
        (s) => s.id === position.section,
      );
      if (!section) return;
      inFlight.current = true;
      const start = epoch.current;
      try {
        const value = await request<MemoryResult>('memoryQueue', {
          projectPath: path,
          section: position.section,
          node: position.node,
          revision: section.revision,
          depth: doc.settings.depth,
          semantic,
        });
        if (!alive || start !== epoch.current || latest.current.p?.path !== path) return;
        if (!value.busy && !value.stale && value.anchorHash !== undefined) {
          const current = latest.current.editor.current?.context();
          if (
            current?.section === position.section &&
            current.node === position.node &&
            !activeView.current
          ) {
            setResult(value);
            setAnchor(position);
          }
          setError(value.modelError ?? '');
        }
        if (value.busy) timer = setTimeout(() => void run(semantic), 250);
        else if (value.pending || value.modelError) {
          const wait = value.deferred || value.modelError ? 5000 : semantic ? 500 : 1200;
          timer = setTimeout(() => void run(true), wait);
        }
      } catch (e) {
        if (alive) {
          setError(String(e));
          timer = setTimeout(() => void run(semantic), 5000);
        }
      } finally {
        inFlight.current = false;
      }
    };
    // Independent promise/timer: a cold or paused GLiNER must never hold up
    // the fast context or semantic queue. Merge entities only for the same hash.
    const runEntities = async () => {
      if (!alive || !native || !path || !doc.settings.enrichment) return;
      if (entitiesInFlight.current || typing.current) {
        entityTimer = setTimeout(() => void runEntities(), 500);
        return;
      }
      const position = latest.current.editor.current?.context();
      const section = latest.current.doc.ref.current?.sections.find(
        (s) => s.id === position?.section,
      );
      if (!position || !section) return;
      entitiesInFlight.current = true;
      const start = epoch.current;
      try {
        const value = await request<{
          entities?: MemoryEntity[];
          anchorHash?: string;
          pending?: boolean;
          retryMs?: number;
          deferred?: boolean;
          busy?: boolean;
          stale?: boolean;
        }>('memoryEntities', {
          projectPath: path,
          section: position.section,
          node: position.node,
          revision: section.revision,
        });
        if (!alive || start !== epoch.current || latest.current.p?.path !== path) return;
        const current = latest.current.editor.current?.context();
        if (
          !value.stale &&
          value.entities &&
          current?.section === position.section &&
          current.node === position.node
        ) {
          setResult((old) =>
            old && old.anchorHash === value.anchorHash
              ? { ...old, entities: value.entities! }
              : old,
          );
          setEntityError('');
        }
        if (value.pending || value.busy || value.deferred) {
          entityTimer = setTimeout(
            () => void runEntities(),
            value.deferred ? (value.retryMs ?? 5000) : value.busy ? 500 : 1000,
          );
        }
      } catch (e) {
        if (alive) {
          setEntityError(String(e));
          entityTimer = setTimeout(() => void runEntities(), 10000);
        }
      } finally {
        entitiesInFlight.current = false;
      }
    };
    entityTimer = setTimeout(() => void runEntities(), 1200);
    timer = setTimeout(() => void run(), 600);
    const save = setTimeout(() => void saveSession().catch(() => {}), 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(entityTimer);
      clearTimeout(save);
    };
  }, [
    p?.path,
    doc.status,
    doc.generation,
    doc.settings.enrichment,
    doc.settings.depth,
    workspace.viewport?.text,
    workspace.viewport?.cursor,
    workspace.active,
    recording,
    refresh,
  ]);

  useEffect(() => {
    const blur = () => void saveSession().catch(() => {});
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);

  function open(value: MemoryView, sourceOrigin?: PanelOrigin) {
    setOrigin(sourceOrigin ?? null);
    workspace.setCard(null);
    workspace.setReader(null);
    workspace.setSearch(null);
    setView(value);
  }
  async function dismiss() {
    const item = result?.recall ?? result?.evidence;
    if (!item?.id || !p) return;
    await request('memoryDismiss', { projectPath: p.path, id: item.id, hash: item.hash });
    setResult(null);
    setView(null);
    setRefresh((n) => n + 1);
  }
  const top = anchor ? (editor.current?.contextTop(anchor.section, anchor.node) ?? null) : null;
  const suggestion: MemoryView | null = result?.recall
    ? { kind: 'recall', passage: result.recall }
    : result?.evidence
      ? { kind: 'evidence', evidence: result.evidence }
      : result?.entities[0]
        ? { kind: 'entity', id: result.entities[0].id }
        : null;
  return {
    result,
    anchor,
    top,
    view,
    origin,
    open,
    close: () => { setView(null); setOrigin(null); },
    resume,
    showResume,
    error: error || entityError,
    suggestion,
    onTyping,
    dismiss,
    saveSession,
    setRecording: (active: boolean) => {
      setRecording(active);
      if (active) {
        activity(true);
        setResult(null);
      }
    },
  };
}
export type MemoryController = ReturnType<typeof useMemory>;
