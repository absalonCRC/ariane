import type { NoteActivityController } from '../notes/useNoteActivity';
import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { EditorHandle, VisibleText } from '../editor/types';
import type { Project } from '../contracts/project';
import type { Source } from '../contracts/sources';
import type { ProjectController } from '../project/useProject';
import type { PanelOrigin } from '../components/useSharedPanel';
import type {
  MemoryPosition,
  MemoryPassage,
  Evidence,
  MemoryResult,
  SessionContext,
} from '../contracts/memory';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { native, request } from '../platform/client';
import { passages, passageKey } from './passages';
export interface MemoryInput {
  activity?: Pick<NoteActivityController, 'record'>;
  doc: ProjectController;
  editor: RefObject<EditorHandle | null>;
  p: Project | null;
  sourceVersion: number;
  enrichmentVersion: number;
  viewport: VisibleText | null;
  memorySessionSaver: RefObject<() => Promise<unknown>>;
  active: string | null;
  reader: Source | null;
  searching: boolean;
  setCard: Dispatch<SetStateAction<{ source: Source; top: number; origin?: PanelOrigin } | null>>;
  setReader: Dispatch<SetStateAction<Source | null>>;
  setSearch: (query: string | null) => void;
}

export type MemoryView =
  | { kind: 'entity'; id: string }
  | { kind: 'recall'; passage: MemoryPassage }
  | { kind: 'evidence'; evidence: Evidence }
  | { kind: 'resume' }
  | { kind: 'list' };

export function useMemory(workspace: MemoryInput) {
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
  const [entityRevision, setEntityRevision] = useState(0);
  const semanticGeneration = useRef(0);
  const cache = useRef(
    new Map<
      string,
      {
        signature: string;
        version: string;
        result: MemoryResult;
        recallSignature: string | null;
        semanticGeneration: number;
      }
    >(),
  );
  const version = `${workspace.sourceVersion ?? 0}:${workspace.enrichmentVersion ?? 0}:${doc.settings.depth}:${JSON.stringify(doc.settings.entityTypes)}`;
  function signature(position: MemoryPosition) {
    const section = latest.current.doc.ref.current?.sections.find((s) => s.id === position.section);
    if (!section) return null;
    return section.text === undefined
      ? (latest.current.viewport?.text ?? '')
      : (passages(section).find((p) => p.node === position.node)?.signature ?? null);
  }
  function recallSignature(value: MemoryResult) {
    const target = value.recall;
    if (!target?.section) return null;
    const section = latest.current.doc.ref.current?.sections.find((s) => s.id === target.section);
    return section?.text === undefined
      ? null
      : (passages(section).find((p) => p.node === target.node)?.signature ?? null);
  }
  function cached(position = latest.current.editor.current?.context()) {
    if (!position) return null;
    const item = cache.current.get(passageKey(position));
    return item &&
      item.signature === signature(position) &&
      item.recallSignature === recallSignature(item.result)
      ? { ...item, position }
      : null;
  }

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
    const saved = cached();
    setResult(saved?.result ?? null);
    setAnchor(saved?.position ?? null);
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
    cache.current.clear();
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
      void request('memorySession', { projectPath: p.path })
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
    if (!doc.settings.enrichment) {
      setResult(null);
      setAnchor(null);
      activity(true);
      return;
    }
    if (doc.status !== 'saved' || recording || workspace.searching) {
      activity(true);
      return;
    }
    let alive = true;
    const saved = cached();
    setResult(saved?.result ?? null);
    setAnchor(saved?.position ?? null);
    let timer: ReturnType<typeof setTimeout>;
    let entityTimer: ReturnType<typeof setTimeout>;
    const path = p?.path;
    const run = async (semantic = false) => {
      if (!alive || !native || !path) return;
      typing.current = false;
      activity(false);
      if (
        saved &&
        saved.version === version &&
        !saved.result.pending &&
        !saved.result.modelError &&
        (saved.result.recall || saved.semanticGeneration === semanticGeneration.current)
      )
        return;
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
      const before = signature(position);
      try {
        const value = await request('memoryQueue', {
          projectPath: path,
          section: position.section,
          node: position.node,
          revision: section.revision,
          depth: doc.settings.depth,
          semantic,
        });
        if (!alive || start !== epoch.current || latest.current.p?.path !== path) return;
        if (value.analyzed) semanticGeneration.current++;
        if (!value.busy && !value.stale && value.anchorHash !== undefined) {
          const current = latest.current.editor.current?.context();
          if (
            current?.section === position.section &&
            current.node === position.node &&
            !activeView.current
          ) {
            if (before !== null && before === signature(position)) {
              cache.current.set(passageKey(position), {
                signature: before,
                version,
                result: value,
                recallSignature: recallSignature(value),
                semanticGeneration: semanticGeneration.current,
              });
              setResult(value);
              setAnchor(position);
            }
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
        const value = await request('memoryEntities', {
          projectPath: path,
          section: position.section,
          node: position.node,
          revision: section.revision,
        });
        if (!alive || start !== epoch.current || latest.current.p?.path !== path) return;
        if (value.available === false) {
          setEntityError(t('Le moteur de détection des entités est indisponible.'));
          return;
        }
        if (value.analyzed) setEntityRevision((n) => n + 1);
        const current = latest.current.editor.current?.context();
        if (
          !value.stale &&
          value.entities &&
          current?.section === position.section &&
          current.node === position.node
        ) {
          setResult((old) => {
            if (!old || old.anchorHash !== value.anchorHash) return old;
            const next = { ...old, entities: value.entities! };
            const stored = cache.current.get(passageKey(position));
            if (stored && stored.signature === signature(position)) stored.result = next;
            return next;
          });
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
    doc.settings.entityTypes,
    workspace.viewport?.text,
    workspace.viewport?.cursor,
    workspace.active,
    p?.sections,
    recording,
    workspace.searching,
    refresh,
    workspace.sourceVersion,
    workspace.enrichmentVersion,
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
    void workspace.activity?.record({
      kind: 'dismissed',
      title: item.title,
      section: anchor?.section,
    });
    const position = editor.current?.context();
    for (const [key, value] of cache.current) {
      if (
        key === (position ? passageKey(position) : '') ||
        value.result.recall?.id === item.id ||
        value.result.evidence?.id === item.id
      )
        cache.current.delete(key);
    }
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
    pending:
      native &&
      !!p &&
      doc.settings.enrichment &&
      (doc.status !== 'saved' || !result || !!result.pending),
    anchor,
    top,
    view,
    origin,
    open,
    close: () => {
      setView(null);
      setOrigin(null);
    },
    resume,
    showResume,
    error: error || entityError,
    entityError,
    entityRevision,
    suggestion,
    onTyping,
    dismiss,
    saveSession,
    setRecording: (active: boolean) => {
      setRecording(active);
      if (active) {
        activity(true);
      }
    },
  };
}
export type MemoryController = ReturnType<typeof useMemory>;
