import { t, useLocale } from '../i18n';
import { useTheme } from './useTheme';
import {
  libraryOperationMessage,
  type LibraryOperation,
  type DocumentRole,
} from '../project/library';
import type { PanelOrigin } from '../components/useSharedPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request, native } from './client';
import type { AnnotationTarget } from '../project/annotations';
import type { ManuscriptOperation } from '../project/library';
import type { Project, Source, Surface, Section } from './types';
import { useProject } from '../project/useProject';
import { scenesFor, ordered } from '../project/tree';
import type { Command } from './Palette';
import type { EditorHandle, VisibleText } from '../editor/Editor';
import { composeCitation, sourceRef } from '../sources/citations';
import type { IndexProgress } from '../sources/Library';
import { useNativeClose } from './useNativeClose';
import { useExport } from '../export/useExport';
import { useUnifiedSearch } from './useUnifiedSearch';
import type { ManuscriptMatch } from './projectSearch';
import { useEnrichment } from '../enrichment/useEnrichment';
export function useWorkspace() {
  useLocale();
  const exportJob = useExport();
  const appearance = useTheme();
  const [error, setError] = useState('');
  const fail = useCallback((e: unknown) => setError(String(e)), []);
  const doc = useProject(fail);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [manuscriptSelection, setManuscriptSelection] = useState<ReturnType<EditorHandle['passage']>>(null);
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
  const searching =
    !!palette && palette !== 'sections' && !!searchQuery.trim() && !searchQuery.startsWith('/');
  const setSearch = useCallback((query: string | null) => {
    if (query === null) {
      setPalette(null);
      setSearchQuery('');
      return;
    }
    setInitialSearch(query);
    setSearchQuery(query);
    setPalette('text');
    if (!historyModeRef.current) setBinder(false);
    setReader(null);
    setCard(null);
  }, []);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [groupOpen, setGroupOpen] = useState<number | null>(null);
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
  } | null>(null);
  const close = useCallback(() => setSurface('none'), []);
  const activate = useCallback(
    (p: Project) => {
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
    void request<Project | null>('bootstrap')
      .then((p) => {
        if (p) activate(p);
      })
      .catch(fail)
      .finally(() => setReady(true));
  }, []);
  useNativeClose(
    doc.flush,
    () =>
      doc.ref.current
        ? memorySessionSaver.current().then(() =>
            request('settings', {
              value: { ...doc.settingsRef.current, cursor: cursor.current },
            }),
          )
        : Promise.resolve(),
    fail,
  );
  const p = doc.project;
  const unifiedSearch = useUnifiedSearch(p, searching ? searchQuery : '', sourceVersion);
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
          const source = await request<Source>('source', { id: card.source.id });
          if (alive) setCard((v) => (v?.source.id === source.id ? { ...v, source } : v));
        }
        if (reader) {
          const source = await request<Source>('source', { id: reader.id });
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
        await doc.flush();
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
    [doc.flush, doc.configure],
  );
  async function locatePassage(section: string, node: string | null, quote: string) {
    setHistoryMode(false);
    if (!(await select(section, false, true))) return;
    setPendingPassage({ section, node, quote });
  }
  useEffect(() => {
    if (!pendingPassage || active !== pendingPassage.section) return;
    const frame = requestAnimationFrame(() => {
      if (!pendingPassage.node || !editor.current?.revealNode(pendingPassage.node))
        editor.current?.findText(pendingPassage.quote);
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
    setBinder(true);
  }
  async function locateSourceMatch(hit: ManuscriptMatch, matched: string) {
    setHistoryMode(false);
    if (!(await select(hit.section, false, true))) return;
    if (card) {
      setReader(card.source);
      setCard(null);
    }
    setPendingMatch({ hit, query: matched });
    setBinder(true);
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
  const visibleText = viewport?.text;
  const visibleAllowEnd = viewport?.allowEnd;
  useEffect(() => {
    if (!p || searching || visibleText === undefined || doc.status !== 'saved') return;
    setSourceStatus('loading');
    const seq = ++serial.current;
    let alive = true;
    const timer = setTimeout(() => {
      void request<Source[]>('suggest', {
        text: visibleText,
        depth: doc.settings.depth,
        allowEnd: visibleAllowEnd,
      })
        .then((s) => {
          if (alive && seq === serial.current) {
            setSources(s);
            setSourceStatus('ready');
          }
        })
        .catch(() => {
          if (alive && seq === serial.current) {
            setSources([]);
            setSourceStatus('error');
          }
        });
    }, 100);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    searching,
    visibleText,
    visibleAllowEnd,
    doc.settings.depth,
    p?.path,
    sourceVersion,
    enrichmentVersion,
    doc.settings.enrichment,
    doc.status,
  ]);
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
      void doc.flush().catch(() => {});
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
  }, [doc.flush, doc.status]);
  const commands: Command[] = p
    ? [
        { label: t('Ouvrir le classeur'), detail: '⌘ ⇧ B', action: () => setBinder((v) => !v) },
        { label: t('Rejoindre une section'), detail: '⌘ P', action: () => setPalette('sections') },
        {
          label: t('Rechercher dans les textes et les vaults'),
          detail: '⌘ ⇧ F',
          action: () => setSearch(editor.current?.selection() || ''),
        },
        ...(native
          ? [{ label: t('Annoter la sélection / Voir les annotations'), action: openAnnotations }]
          : []),
        { label: t('Importer un manuscrit'), action: () => setSurface('import') },
        ...(native
          ? [{ label: t('Séparer ou réunir des scènes'), action: () => void prepareManuscript() }]
          : []),
        { label: t('Sources du projet'), action: () => setSurface('sources') },
        { label: t('Préparer cette section'), action: () => setSurface('prepare') },
        {
          label: t('Créer une variante / Voir les versions'),
          action: () => openSurface('history'),
        },
        { label: t('Exporter le manuscrit'), detail: '⌘ ⇧ E', action: () => setSurface('export') },
        { label: t('Réglages d’écriture'), action: () => setSurface('settings') },
        { label: t('Paramètres'), action: () => setSurface('preferences') },
        {
          label: t('Indenter le passage'),
          detail: 'Tab',
          action: () => editor.current?.structure('indent'),
        },
        {
          label: t('Désindenter le passage'),
          detail: '⇧ Tab',
          action: () => editor.current?.structure('outdent'),
        },
        {
          label: t('Monter la branche'),
          detail: '⌥ ↑',
          action: () => editor.current?.structure('up'),
        },
        {
          label: t('Descendre la branche'),
          detail: '⌥ ↓',
          action: () => editor.current?.structure('down'),
        },
        {
          label: t('Replier ou déplier le passage'),
          detail: '⌘ ⌥ ← / →',
          action: () => editor.current?.structure('fold'),
        },
        { label: t('Lire le manuscrit entier'), action: () => void select(active || '', true) },
        {
          label: t('Ajouter une scène'),
          action: () => void createPage(selected?.parent || null, selected?.role),
        },
        {
          label: t('Créer un projet'),
          action: () => {
            void doc.flush().then(() => setNewProject(true));
          },
        },
        { label: t('Ouvrir un projet'), action: () => setSurface('projects') },
        { label: t('Enregistrer'), detail: '⌘ S', action: () => void doc.flush().catch(() => {}) },
      ]
    : [];
  const nativeCommand = useRef<(id: string) => void>(() => {});
  nativeCommand.current = (id) => {
    if (libraryLock.current || document.querySelector('dialog[open][aria-modal="true"]')) return;
    if (!p || newProject) return;
    if (id === 'save') {
      void doc.flush().catch(fail);
      return;
    }
    if (id === 'new-project') {
      void doc
        .flush()
        .then(() => setNewProject(true))
        .catch(fail);
      return;
    }
    if (id === 'open-project') {
      setSurface('projects');
      return;
    }
    if (id === 'annotations') {
      openAnnotations();
      return;
    }
    if (id === 'manuscript') {
      void prepareManuscript();
      return;
    }
    if (id === 'binder') {
      setBinder((v) => !v);
      return;
    }
    if (id === 'commands') {
      setPalette('commands');
      return;
    }
    if (id === 'sections') {
      setPalette('sections');
      return;
    }
    if (id === 'search') {
      setSearch(editor.current?.selection() || '');
      return;
    }
    if (['import', 'export', 'history', 'preferences', 'sources'].includes(id))
      openSurface(id as Surface);
  };
  useEffect(() => {
    if (!native) return;
    let stop: (() => void) | undefined,
      disposed = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('app-command', (e) => nativeCommand.current(e.payload)))
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(fail);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.workspace-screen[open]')) return;
      if (libraryLock.current) {
        e.preventDefault();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        setPalette((v) => (v ? null : 'commands'));
      }
      if (k === 'p') {
        e.preventDefault();
        setPalette('sections');
      }
      if (k === 's') {
        e.preventDefault();
        void doc.flush().catch(() => {});
      }
      if (e.shiftKey && k === 'b') {
        e.preventDefault();
        setBinder((v) => !v);
      }
      if (k === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setSearch(editor.current?.selection() || '');
      }
      if (e.shiftKey && k === 'e') {
        e.preventDefault();
        setSurface('export');
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCard(null);
        setReader(null);
        setSearch(null);
        setBinder(false);
        setMenu(false);
        setSurface('none');
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', escape);
    };
  }, [doc.flush]);
  async function openProject(path: string, section?: string) {
    if (libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.flush();
      await metadataQueue.current;
      await memorySessionSaver.current();
      if (doc.ref.current)
        await request('settings', {
          value: { ...doc.settingsRef.current, cursor: cursor.current },
        });
      const project = await request<Project>('open', { path });
      if (section)
        project.settings = {
          ...project.settings,
          active: section,
          continuous: false,
          cursor: 0,
          libraryView: 'texts',
        };
      activate(project);
      setSurface('none');
      setBinder(true);
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  function openAnnotations() {
    const passage = editor.current?.passage();
    const section = doc.ref.current?.sections.find((s) => s.id === passage?.section);
    setAnnotationTarget(passage?.text && section ? { ...passage, original: section.text } : null);
    setAnnotationsOpen(true); setCard(null); setReader(null); setSearch(null);
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
    } catch (e) { fail(e); }
  }
  async function manuscriptOperation(operation: ManuscriptOperation) {
    if (libraryLock.current) return;
    libraryLock.current = true; setLibraryBusy(true);
    try {
      await doc.flush();
      await metadataQueue.current;
      const next = await request<Project>('manuscriptOperation', {
        projectPath: doc.ref.current!.path,
        operation,
      });
      next.settings = {
        ...doc.settingsRef.current,
        active: operation.sourceId,
        continuous: false,
        cursor: 0,
      };
      doc.activate(next);
      setSurface('none');
      setBinder(true);
      setLibraryNotice({ message: t('Texte réorganisé.'), undo: false });
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  async function operate(operation: LibraryOperation) {
    if (libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.flush();
      await metadataQueue.current;
      await request('settings', { value: { ...doc.settingsRef.current, cursor: cursor.current } });
      const message = libraryOperationMessage(doc.ref.current!, operation);
      const next = await request<Project>('libraryOperation', { operation });
      doc.activate(next);
      setLibraryNotice({ message, undo: operation.action !== 'undo' });
      setSourceVersion((v) => v + 1);
      setBinder(true);
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  function startCreation(
    parent: string | null,
    kind: Section['kind'],
    role?: DocumentRole,
    after?: string,
  ) {
    if (!doc.ref.current || libraryLock.current) return;
    setNewSection({ parent, kind, role: role || 'manuscript', after });
    setNewTitle('');
    setSearch(null);
    doc.configure({ libraryView: 'texts' });
    setSurface('none');
    setBinder(true);
  }
  async function createPage(parent: string | null, role?: DocumentRole) {
    startCreation(parent, 'scene', role);
  }
  async function add() {
    if (!newSection || !newTitle.trim() || libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.flush();
      await metadataQueue.current;
      const sections = newSection.after
        ? (
            await request<Project>('libraryOperation', {
              operation: {
                action: 'add',
                target: newSection.after,
                placement: 'after',
                kind: newSection.kind,
                role: newSection.role,
                title: newTitle.trim(),
              },
            })
          ).sections
        : await request<Section[]>('add', { ...newSection, title: newTitle.trim() });
      setLibraryNotice(null);
      doc.replaceSections(sections, true, true);
      const added = sections.find((s) => !p!.sections.some((old) => old.id === s.id));
      if (added) doc.configure({ active: added.id, continuous: false, cursor: 0 });
      setNewSection(null);
      setNewTitle('');
      setBinder(true);
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  async function move(id: string, target: string, inside: boolean) {
    try {
      await doc.flush();
      const all = ordered(p!.sections);
      const ids = all.map((s) => s.id).filter((x) => x !== id);
      ids.splice(ids.indexOf(target) + (inside ? 1 : 0), 0, id);
      doc.replaceSections(
        await request('reorder', {
          ids,
          id,
          parent: inside ? target : all.find((s) => s.id === target)!.parent,
        }),
      );
    } catch (e) {
      fail(e);
    }
  }
  async function registerCitation(s: Source, text: string) {
    await request('cite', {
      id: sourceRef(s),
      payload: { ...s, quote: text, citedAt: new Date().toISOString() },
    });
  }
  async function cite(s: Source, text: string) {
    try {
      const insert = editor.current?.prepareCitation();
      const citation = composeCitation(s, text, doc.settings.citationStyle);
      await registerCitation(s, text);
      if (!insert?.(citation))
        throw new Error(t('Le texte a changé. Replacez le curseur puis réessayez.'));
      setCard(null);
    } catch (e) {
      fail(e);
    }
  }
  async function read(s: Source) {
    try {
      const full = await request<Source>('source', { id: s.id });
      full.page = s.page;
      setReader(full);
      setCard(null);
    } catch (e) {
      fail(e);
    }
  }
  function update(section: Section) {
    const path = doc.ref.current?.path;
    const task = metadataQueue.current
      .catch(() => {})
      .then(async () => {
        if (doc.ref.current?.path !== path) return;
        await doc.flush();
        const sections = await request<Section[]>('update', { section });
        if (doc.ref.current?.path === path) doc.replaceSections(sections, false);
      });
    metadataQueue.current = task.catch(() => {});
    return task;
  }
  async function apply(id: string, text: string, revision: number) {
    await doc.flush();
    const current = doc.ref.current!.sections.find((s) => s.id === id)!;
    if (current.revision !== revision)
      throw new Error(t('Le texte a changé. Relancez la comparaison.'));
    await request('save', { patches: [{ id, text, revision }] });
    activate(await request('open', { path: p!.path }));
  }
  const groups = useMemo(() => {
    if (!viewport) return [];
    const map = new Map<number, { top: number; sources: Source[] }>();
    for (const s of sources) {
      const line =
        viewport.paragraphs.find(
          (l) =>
            s.matched &&
            l.text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(s.matched),
        ) || (!s.matched ? viewport.paragraphs[0] : undefined);
      if (!line || !Number.isFinite(line.top)) continue;
      const existing = map.get(line.line);
      if (existing) existing.sources.push(s);
      else map.set(line.line, { top: line.top, sources: [s] });
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
  }, [sources, viewport, groupOpen]);
  return {
    appearance,
    exportJob,
    libraryBusy,
    libraryNotice,
    setLibraryNotice,
    revealInBinder,
    setRevealInBinder,
    locateSourceMatch,
    operate,
    annotationsOpen, setAnnotationsOpen, annotationTarget, setAnnotationTarget, openAnnotations,
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
    unifiedSearch,
    locateMatch,
    setSearch,
    progress,
    setProgress,
    groupOpen,
    setGroupOpen,
    setSourceVersion,
    sourceVersion,
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
