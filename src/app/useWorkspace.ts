import { useNoteActivity } from '../notes/useNoteActivity';
import { useWorkspaceCommands } from './commands/useWorkspaceCommands';
import { createSourceActions } from '../sources/actions';
import { createProjectOperations } from '../project/operations';
import { t, useLocale } from '../i18n';
import { useTheme } from './useTheme';
import { type DocumentRole } from '../contracts/library';
import type { PanelOrigin } from '../components/useSharedPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request, native } from '../platform/client';
import type { AnnotationTarget } from '../project/annotations';
import type { Project, Section } from '../contracts/project';
import type { Source } from '../contracts/sources';
import type { Surface } from './workspace/types';
import { useProject } from '../project/useProject';
import { scenesFor } from '../project/tree';
import type { EditorHandle, VisibleText } from '../editor/Editor';
import type { IndexProgress } from '../sources/Library';
import { useNativeClose } from './useNativeClose';
import { useExport } from '../export/useExport';
import { useVaultSearch } from './useUnifiedSearch';
import type { ManuscriptMatch } from './projectSearch';
import { useEnrichment } from '../enrichment/useEnrichment';
import { usePassageSuggestions } from '../enrichment/usePassageSuggestions';
import { passageKey } from '../enrichment/passages';
export function useWorkspace() {
  useLocale();
  const exportJob = useExport();
  const appearance = useTheme();
  const [error, setError] = useState('');
  const fail = useCallback((e: unknown) => setError(String(e)), []);
  const doc = useProject(fail);
  const activity = useNoteActivity(doc.project?.path);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [manuscriptSelection, setManuscriptSelection] =
    useState<ReturnType<EditorHandle['passage']>>(null);
  const [surface, setSurface] = useState<Surface>('none');
  const [historyMode, setHistoryMode] = useState(false);
  const historyModeRef = useRef(historyMode);
  historyModeRef.current = historyMode;
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryNotice, setLibraryNotice] = useState<{ message: string; undo: boolean } | null>(
    null,
  );
  const [revealInBinder, setRevealInBinder] = useState(0);
  const libraryLock = useRef(false);
  const [binder, setBinder] = useState(false);
  const binderBeforeFocus = useRef<boolean | null>(null);
  const [palette, setPalette] = useState<'text' | 'commands' | 'sections' | null>(null);
  const [words, setWords] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceStatus, setSourceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [card, setCard] = useState<{ source: Source; top: number; origin?: PanelOrigin } | null>(
    null,
  );
  const [reader, setReader] = useState<Source | null>(null);
  const openSurface = useCallback((value: Surface) => {
    if (value === 'history') {
      setHistoryMode(true);
      setSurface('none');
      setBinder(true);
      setCard(null);
      setReader(null);
      setPalette(null);
    } else setSurface(value);
  }, []);
  useEffect(() => setHistoryMode(false), [doc.project?.path]);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialSearch, setInitialSearch] = useState('');
  const searching = palette === 'text' && !!searchQuery.trim();
  const setSearch = useCallback((query: string | null) => {
    if (query === null) {
      setPalette(null);
      setSearchQuery('');
      return;
    }
    setInitialSearch(query);
    setSearchQuery(query);
    setPalette('text');
    setHistoryMode(false);
    if (!doc.settingsRef.current.immersiveFocus) {
      if (!historyModeRef.current) setBinder(false);
    }
  }, []);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [groupOpen, setGroupOpen] = useState<string | number | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [enrichmentVersion, setEnrichmentVersion] = useState(0);
  const refreshEnrichment = useCallback(() => setEnrichmentVersion((v) => v + 1), []);
  const enrichmentError = useEnrichment(
    doc.project?.path,
    doc.settings.enrichment,
    doc.status,
    doc.generation,
    sourceVersion,
    refreshEnrichment,
  );
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [newSection, setNewSection] = useState<{
    parent: string | null;
    kind: Section['kind'];
    role?: DocumentRole;
    after?: string;
  } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const metadataQueue = useRef<Promise<void>>(Promise.resolve());
  const [menu, setMenu] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [viewport, setViewport] = useState<VisibleText | null>(null);
  const serial = useRef(0);
  const editor = useRef<EditorHandle>(null);
  const cursor = useRef(0);
  const memorySessionSaver = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const [pendingPassage, setPendingPassage] = useState<{
    section: string;
    node: string | null;
    quote: string;
    position?: { offset: number; cursor: number };
  } | null>(null);
  const close = useCallback(() => setSurface('none'), []);
  const toggleFocus = useCallback(() => {
    const entering = !doc.settingsRef.current.immersiveFocus;
    if (entering) {
      binderBeforeFocus.current = binder;
      setBinder(false);
    } else if (binderBeforeFocus.current !== null) {
      setBinder(binderBeforeFocus.current);
      binderBeforeFocus.current = null;
    }
    doc.configure({ immersiveFocus: entering });
    setHistoryMode(false);
    setSurface('none');
    setMenu(false);
    setPalette(null);
    requestAnimationFrame(() => editor.current?.focus());
  }, [binder, doc.configure]);
  const activate = useCallback(
    (p: Project) => {
      binderBeforeFocus.current = null;
      doc.activate(p);
      serial.current++;
      setViewport(null);
      setAnnotationsOpen(false);
      setAnnotationTarget(null);
      setSources([]);
      setSourceStatus('loading');
      setCard(null);
      setReader(null);
      setSearch(null);
      setRecovery(p.recovered);
      setError(p.conflicts?.length ? 'EXTERNAL:' + p.conflicts[0] : '');
      setNewProject(false);
      setNewSection(null);
      setNewTitle('');
      setLibraryNotice(null);
      setRevealInBinder(0);
    },
    [doc.activate],
  );
  useEffect(() => {
    void request('bootstrap')
      .then((p) => {
        if (p) activate(p);
      })
      .catch(fail)
      .finally(() => setReady(true));
  }, []);
  useNativeClose(
    doc.checkpoint,
    () =>
      activity.flush().then(() =>
        doc.ref.current
          ? memorySessionSaver.current().then(() =>
              request('settings', {
                value: { ...doc.settingsRef.current, cursor: cursor.current },
              }),
            )
          : Promise.resolve(),
      ),
    fail,
  );
  const p = doc.project;
  const vaultSearch = useVaultSearch(
    p,
    searching && !/^[#@/]/.test(searchQuery.trim()) ? searchQuery : '',
    sourceVersion,
  );
  const active = p?.sections.some((s) => s.id === doc.settings.active)
    ? doc.settings.active
    : p?.sections.find((s) => s.kind === 'scene')?.id || null;
  const selected = p?.sections.find((s) => s.id === active);
  const scenes = useMemo(
    () => (p ? scenesFor(p.sections, active, doc.settings.continuous) : []),
    [p, active, doc.settings.continuous],
  );
  useEffect(() => {
    if (!native) return;
    let alive = true;
    let dispose: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen('index-finished', () => {
          if (alive) {
            setProgress(null);
            setSourceVersion((v) => v + 1);
          }
        }),
      )
      .then((f) => {
        if (alive) dispose = f;
        else f();
      });
    return () => {
      alive = false;
      dispose?.();
    };
  }, []);
  useEffect(() => {
    if (!p) return;
    let alive = true;
    const refresh = async () => {
      try {
        if (card) {
          const source = await request('source', { id: card.source.id });
          if (alive) setCard((v) => (v?.source.id === source.id ? { ...v, source } : v));
        }
        if (reader) {
          const source = await request('source', { id: reader.id });
          if (alive)
            setReader((v) =>
              v?.id === source.id
                ? {
                    ...source,
                    page: v.page,
                    selectedExcerpt:
                      v.fingerprint === source.fingerprint ? v.selectedExcerpt : undefined,
                  }
                : v,
            );
        }
      } catch {
        /* A removed source is refreshed on its next opening. */
      }
    };
    void refresh();
    return () => {
      alive = false;
    };
  }, [p?.path, sourceVersion, enrichmentVersion, doc.settings.enrichment]);
  const select = useCallback(
    async (id: string, continuous = false, preserveSource = false) => {
      if (libraryLock.current) return false;
      try {
        await doc.checkpoint();
        await memorySessionSaver.current();
        doc.configure({ active: id, continuous, cursor: 0 });
        serial.current++;
        if (!preserveSource) setCard(null);
        setSources([]);
        setSourceStatus('loading');
        setSourceVersion((v) => v + 1);
        if (!preserveSource) setReader(null);
        setRevealInBinder((v) => v + 1);
        return true;
      } catch {
        return false;
      }
    },
    [doc.checkpoint, doc.configure],
  );
  async function locatePassage(
    section: string,
    node: string | null,
    quote: string,
    position?: { offset: number; cursor: number },
  ) {
    setHistoryMode(false);
    if (!(await select(section, false, true))) return;
    setPendingPassage({ section, node, quote, position });
  }
  useEffect(() => {
    if (!pendingPassage || active !== pendingPassage.section) return;
    const frame = requestAnimationFrame(() => {
      const restored =
        pendingPassage.position &&
        editor.current?.restoreContext({ ...pendingPassage, ...pendingPassage.position });
      if (!restored && (!pendingPassage.node || !editor.current?.revealNode(pendingPassage.node)))
        editor.current?.findText(pendingPassage.quote);
      editor.current?.focus();
      setPendingPassage(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, pendingPassage]);
  const [pendingMatch, setPendingMatch] = useState<{ hit: ManuscriptMatch; query: string } | null>(
    null,
  );
  async function locateMatch(hit: ManuscriptMatch) {
    setHistoryMode(false);
    const query = searchQuery.trim();
    if (!(await select(hit.section))) return;
    setPendingMatch({ hit, query });
    if (!doc.settingsRef.current.immersiveFocus) setBinder(true);
  }
  async function locateSourceMatch(hit: ManuscriptMatch, matched: string) {
    setHistoryMode(false);
    if (!(await select(hit.section, false, true))) return;
    if (card) {
      setReader(card.source);
      setCard(null);
    }
    setPendingMatch({ hit, query: matched });
    if (!doc.settingsRef.current.immersiveFocus) setBinder(true);
  }
  useEffect(() => {
    if (!pendingMatch || active !== pendingMatch.hit.section) return;
    const frame = requestAnimationFrame(() => {
      editor.current?.revealMatch(
        pendingMatch.hit.section,
        pendingMatch.hit.from,
        pendingMatch.query,
      );
      setPendingMatch(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, pendingMatch]);
  const onVisible = useCallback((v: VisibleText) => setViewport(v), []);
  const passageSources = usePassageSuggestions(
    p?.path,
    scenes,
    viewport,
    doc.status,
    doc.settings.enrichment,
    doc.settings.depth,
    `${sourceVersion}:${enrichmentVersion}:${doc.settings.depth}`,
    setSources,
    setSourceStatus,
  );
  useEffect(() => {
    if (!native) return;
    let dispose: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen<IndexProgress>('index-progress', (e) => setProgress(e.payload)))
      .then((f) => (dispose = f));
    return () => dispose?.();
  }, []);
  useEffect(() => {
    const f = () => {
      if (!doc.ref.current) return;
      const all = { ...doc.settingsRef.current, cursor: cursor.current };
      void request('settings', { value: all }).catch(() => {});
      void doc.checkpoint().catch(fail);
    };
    window.addEventListener('blur', f);
    const before = (e: BeforeUnloadEvent) => {
      if (doc.status !== 'saved') {
        e.preventDefault();
        void doc.flush().catch(() => {});
      }
    };
    window.addEventListener('beforeunload', before);
    return () => {
      window.removeEventListener('blur', f);
      window.removeEventListener('beforeunload', before);
    };
  }, [doc.flush, doc.checkpoint, doc.status]);
  const {
    openProject,
    manuscriptOperation,
    operate,
    startCreation,
    createPage,
    add,
    move,
    update,
    apply,
  } = createProjectOperations({
    beforeSwitch: activity.flush,
    libraryLock,
    setLibraryBusy,
    doc,
    metadataQueue,
    memorySessionSaver,
    cursor,
    activate,
    setSurface,
    setBinder,
    fail,
    setLibraryNotice,
    setSourceVersion,
    setNewSection,
    setNewTitle,
    setSearch,
    newSection,
    newTitle,
    p,
  });
  const { registerCitation, cite, read } = createSourceActions({
    activity,
    editor,
    doc,
    setCard,
    fail,
    setReader,
  });
  const commands = useWorkspaceCommands({
    p,
    doc,
    toggleFocus,
    setBinder,
    setPalette,
    setSearch,
    editor,
    openAnnotations,
    setSurface,
    prepareManuscript,
    openSurface,
    select,
    active,
    createPage,
    selected,
    setNewProject,
    fail,
    libraryLock,
    newProject,
    setCard,
    setReader,
    setMenu,
  });

  function openAnnotations() {
    const passage = editor.current?.passage();
    const section = doc.ref.current?.sections.find((s) => s.id === passage?.section);
    setAnnotationTarget(passage?.text && section ? { ...passage, original: section.text } : null);
    setAnnotationsOpen(true);
    setCard(null);
    setReader(null);
    setSearch(null);
  }
  async function prepareManuscript() {
    const selection = editor.current?.passage();
    if (!selection) return;
    const text = editor.current?.text();
    try {
      await doc.flush();
      if (editor.current?.text() !== text)
        throw new Error(t('Le texte a changé. Replacez le curseur puis réessayez.'));
      setManuscriptSelection(selection);
      setSurface('manuscript');
    } catch (e) {
      fail(e);
    }
  }

  const groups = useMemo(() => {
    if (!viewport) return [];
    const map = new Map<string, { top: number; sources: Source[] }>();
    for (const { block, sources: matches } of passageSources) {
      const lines = viewport.paragraphs.filter(
        (line) => line.from !== undefined && line.from >= block.from && line.from < block.to,
      );
      const first = matches.find((source) => !!source.matched);
      const fallback = lines.find(
        (line) =>
          !first ||
          line.text
            .toLocaleLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .includes(first.matched!),
      );
      const top = editor.current?.contextTop(block.section, block.node) ?? fallback?.top;
      if (top === undefined || !Number.isFinite(top) || !matches.length) continue;
      map.set(passageKey(block), { top, sources: matches });
    }
    const arr = Array.from(map.entries()).sort((a, b) => a[1].top - b[1].top);
    let bottom = -Infinity;
    return arr.map(([id, g]) => {
      const top = Math.max(bottom, g.top);
      bottom =
        top +
        (groupOpen === id
          ? Math.min(g.sources.length * 54, 250) + 34
          : Math.min(g.sources.length, 2) * 54 + (g.sources.length > 2 ? 24 : 0)) +
        12;
      return { id, top, sources: g.sources };
    });
  }, [passageSources, viewport, groupOpen]);
  return {
    activity,
    appearance,
    exportJob,
    libraryBusy,
    libraryNotice,
    setLibraryNotice,
    revealInBinder,
    setRevealInBinder,
    locateSourceMatch,
    operate,
    annotationsOpen,
    setAnnotationsOpen,
    annotationTarget,
    setAnnotationTarget,
    openAnnotations,
    manuscriptSelection,
    manuscriptOperation,
    prepareManuscript,
    openProject,
    enrichmentError,
    refreshEnrichment,
    locatePassage,
    error,
    setError,
    fail,
    doc,
    surface,
    setSurface: openSurface,
    historyMode,
    setHistoryMode,
    binder,
    setBinder,
    palette,
    setPalette,
    words,
    setWords,
    sources,
    setSources,
    sourceStatus,
    setSourceStatus,
    card,
    setCard,
    reader,
    setReader,
    searching,
    searchQuery,
    initialSearch,
    setSearchQuery,
    vaultSearch,
    locateMatch,
    setSearch,
    progress,
    setProgress,
    groupOpen,
    setGroupOpen,
    setSourceVersion,
    sourceVersion,
    enrichmentVersion,
    ready,
    recovery,
    setRecovery,
    newSection,
    setNewSection,
    startCreation,
    newTitle,
    setNewTitle,
    menu,
    setMenu,
    newProject,
    setNewProject,
    serial,
    editor,
    cursor,
    close,
    activate,
    p,
    active,
    selected,
    scenes,
    select,
    onVisible,
    commands,
    toggleFocus,
    createPage,
    add,
    move,
    cite,
    registerCitation,
    read,
    update,
    apply,
    groups,
    marginBounds: viewport?.bounds,
    viewport,
    memorySessionSaver,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
