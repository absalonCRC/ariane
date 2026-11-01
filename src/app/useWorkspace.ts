import type { PanelOrigin } from '../components/useSharedPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request, native } from './client';
import type { Project, Source, Surface, Section } from './types';
import { useProject } from '../project/useProject';
import { scenesFor, ordered } from '../project/tree';
import type { Command } from './Palette';
import type { EditorHandle, VisibleText } from '../editor/Editor';
import { composeCitation, sourceRef } from '../sources/citations';
import type { IndexProgress } from '../sources/Library';
import { useNativeClose } from './useNativeClose';
import { useExport } from '../export/useExport';
import { useEnrichment } from '../enrichment/useEnrichment';
export function useWorkspace() {
  const exportJob = useExport();
  const [error, setError] = useState('');
  const fail = useCallback((e: unknown) => setError(String(e)), []);
  const doc = useProject(fail);
  const [surface, setSurface] = useState<Surface>('none');
  const [binder, setBinder] = useState(false);
  const [palette, setPalette] = useState<'text' | 'commands' | 'sections' | null>(null);
  const [words, setWords] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceStatus, setSourceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [card, setCard] = useState<{ source: Source; top: number; origin?: PanelOrigin } | null>(null);
  const [reader, setReader] = useState<Source | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [groupOpen, setGroupOpen] = useState<number | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [enrichmentVersion, setEnrichmentVersion] = useState(0);
  const refreshEnrichment = useCallback(() => setEnrichmentVersion((v) => v + 1), []);
  const enrichmentError = useEnrichment(doc.project?.path, doc.settings.enrichment, doc.status, doc.generation, sourceVersion, refreshEnrichment);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [newSection, setNewSection] = useState<{
    parent: string | null;
    kind: Section['kind'];
  } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [menu, setMenu] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [viewport, setViewport] = useState<VisibleText | null>(null);
  const serial = useRef(0);
  const editor = useRef<EditorHandle>(null);
  const cursor = useRef(0);
  const memorySessionSaver = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const [pendingPassage, setPendingPassage] = useState<{ section: string; node: string | null; quote: string } | null>(null);
  const close = useCallback(() => setSurface('none'), []);
  const activate = useCallback(
    (p: Project) => {
      doc.activate(p);
      serial.current++;
      setViewport(null);
      setSources([]);
      setSourceStatus('loading');
      setCard(null);
      setReader(null);
      setSearch(null);
      setRecovery(p.recovered);
      setError(p.conflicts?.length ? 'EXTERNAL:' + p.conflicts[0] : '');
      setNewProject(false);
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
        ? memorySessionSaver.current().then(() => request('settings', { value: { ...doc.settingsRef.current, cursor: cursor.current } }))
        : Promise.resolve(),
    fail,
  );
  const p = doc.project;
  const active = doc.settings.active || p?.sections.find((s) => s.kind === 'scene')?.id || null;
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
          if (alive) setCard((v) => v?.source.id === source.id ? { ...v, source } : v);
        }
        if (reader) {
          const source = await request<Source>('source', { id: reader.id });
          if (alive) setReader((v) => v?.id === source.id ? { ...source, page: v.page, selectedExcerpt: v.fingerprint === source.fingerprint ? v.selectedExcerpt : undefined } : v);
        }
      } catch { /* A removed source is refreshed on its next opening. */ }
    };
    void refresh();
    return () => { alive = false; };
  }, [p?.path, sourceVersion, enrichmentVersion, doc.settings.enrichment]);
  const select = useCallback(
    async (id: string, continuous = false) => {
      try {
        await doc.flush();
        await memorySessionSaver.current();
        doc.configure({ active: id, continuous, cursor: 0 });
        serial.current++;
        setBinder(false);
        setCard(null);
        setSources([]);
        setSourceStatus('loading');
        setSourceVersion((v) => v + 1);
        setReader(null);
        setSearch(null);
      } catch {}
    },
    [doc.flush, doc.configure],
  );
  async function locatePassage(section: string, node: string | null, quote: string) {
    await select(section);
    setPendingPassage({ section, node, quote });
  }
  useEffect(() => {
    if (!pendingPassage || active !== pendingPassage.section) return;
    const frame = requestAnimationFrame(() => {
      if (!pendingPassage.node || !editor.current?.revealNode(pendingPassage.node)) editor.current?.findText(pendingPassage.quote);
      setPendingPassage(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, pendingPassage]);
  const onVisible = useCallback((v: VisibleText) => setViewport(v), []);
  const visibleText = viewport?.text;
  const visibleAllowEnd = viewport?.allowEnd;
  useEffect(() => {
    if (!p || visibleText === undefined || doc.status !== 'saved') return;
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
  }, [visibleText, visibleAllowEnd, doc.settings.depth, p?.path, sourceVersion, enrichmentVersion, doc.settings.enrichment, doc.status]);
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
        { label: 'Ouvrir le classeur', detail: '⌘ ⇧ B', action: () => setBinder((v) => !v) },
        { label: 'Rejoindre une section', detail: '⌘ P', action: () => setPalette('sections') },
        {
          label: 'Rechercher dans les sources',
          detail: '⌘ ⇧ F',
          action: () => setSearch(editor.current?.selection() || ''),
        },
        { label: 'Sources du projet', action: () => setSurface('sources') },
        { label: 'Préparer cette section', action: () => setSurface('prepare') },
        { label: 'Créer une variante / Voir les versions', action: () => setSurface('history') },
        { label: 'Exporter le manuscrit', detail: '⌘ ⇧ E', action: () => setSurface('export') },
        { label: 'Réglages d’écriture', action: () => setSurface('settings') },
        { label: 'Paramètres', action: () => setSurface('preferences') },
        { label: 'Indenter le passage', detail: 'Tab', action: () => editor.current?.structure('indent') },
        { label: 'Désindenter le passage', detail: '⇧ Tab', action: () => editor.current?.structure('outdent') },
        { label: 'Monter la branche', detail: '⌥ ↑', action: () => editor.current?.structure('up') },
        { label: 'Descendre la branche', detail: '⌥ ↓', action: () => editor.current?.structure('down') },
        { label: 'Replier ou déplier le passage', detail: '⌘ ⌥ ← / →', action: () => editor.current?.structure('fold') },
        { label: 'Lire le manuscrit entier', action: () => void select(active || '', true) },
        {
          label: 'Ajouter une scène',
          action: () => setNewSection({ parent: selected?.parent || null, kind: 'scene' }),
        },
        {
          label: 'Créer un projet',
          action: () => {
            void doc.flush().then(() => setNewProject(true));
          },
        },
        { label: 'Ouvrir un projet', action: () => setSurface('projects') },
        { label: 'Enregistrer', detail: '⌘ S', action: () => void doc.flush().catch(() => {}) },
      ]
    : [];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      if (e.shiftKey && k === 'f') {
        e.preventDefault();
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
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', escape);
    };
  }, [doc.flush]);
  async function add() {
    if (!newSection || !newTitle.trim()) return;
    try {
      await doc.flush();
      const sections = await request<Section[]>('add', { ...newSection, title: newTitle.trim() });
      doc.replaceSections(sections);
      const added = sections.find((s) => !p!.sections.some((old) => old.id === s.id));
      if (added) doc.configure({ active: added.id, continuous: false, cursor: 0 });
      setNewSection(null);
      setNewTitle('');
    } catch (e) {
      fail(e);
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
      await registerCitation(s, text);
      editor.current?.insert(composeCitation(s, text, doc.settings.citationStyle));
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
      setSearch(null);
      setCard(null);
    } catch (e) {
      fail(e);
    }
  }
  async function update(section: Section) {
    await doc.flush();
    doc.replaceSections(await request('update', { section }), false);
  }
  async function apply(id: string, text: string, revision: number) {
    await doc.flush();
    const current = doc.ref.current!.sections.find((s) => s.id === id)!;
    if (current.revision !== revision)
      throw new Error('Le texte a changé. Relancez la comparaison.');
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
      bottom = top + (groupOpen === id ? Math.min(g.sources.length * 54, 250) + 34 : Math.min(g.sources.length, 2) * 54 + (g.sources.length > 2 ? 24 : 0)) + 12;
      return { id, top, sources: g.sources };
    });
  }, [sources, viewport, groupOpen]);
  return {
    exportJob,
    enrichmentError,
    refreshEnrichment,
    locatePassage,
    error,
    setError,
    fail,
    doc,
    surface,
    setSurface,
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
    search,
    setSearch,
    progress,
    setProgress,
    groupOpen,
    setGroupOpen,
    setSourceVersion,
    ready,
    recovery,
    setRecovery,
    newSection,
    setNewSection,
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
