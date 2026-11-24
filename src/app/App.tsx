import type { InboxChange } from '../contracts/inbox';
import { Inbox } from '../capture/Inbox';
import { loadGlobalShortcut } from './commands/shortcuts';
import { nativeBindings } from './commands/shortcuts';
import { useEntityManager } from '../entities/useEntityManager';
import { EntityManager } from '../entities/EntityManager';
import { StructuredSearch } from '../search/StructuredSearch';
import { evaluateQuery } from '../search/evaluateQuery';
import { queryLabel } from '../search/resolveQuery';
import type { StructuredQuery } from '../contracts/structuredQuery';
import { WindowDragRegion } from '../components/WindowDragRegion';
import { useNoteObservations } from '../notes/useNoteObservations';
import { WritingSurface } from './writing/WritingSurface';
import { useBottomPanel } from './chrome/useBottomPanel';
import { MemorySuggestion } from '../enrichment/MemorySuggestion';
import { DocumentaryMargin } from '../sources/margin/DocumentaryMargin';
import { WorkspaceHeader } from './chrome/WorkspaceHeader';
import { HistoryEdge } from './chrome/HistoryEdge';
import { BranchMenu } from '../history/BranchMenu';
import { useWritingBranches } from '../history/useWritingBranches';
import { marginLayout } from '../sources/marginLayout';
import { useNoteCreation } from '../enrichment/useNoteCreation';
import { useInlineEntities } from '../enrichment/useInlineEntities';
import { EntityProposal } from '../enrichment/EntityProposal';
import { localizeMessage, t, useLocale, localeTag } from '../i18n';
import { useCallback, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Presence, usePresenceValue } from '../components/Presence';
import { SelectionToolbar, type SelectionAnchor } from '../components/SelectionToolbar';
import { WritingCounter } from '../components/WritingCounter';
import { DepthControl } from '../components/DepthControl';
import { AlignLeft, Table2, ChevronRight, GitCompareArrows } from 'lucide-react';
import { Palette } from './Palette';
import { request, native } from '../platform/client';
import { Welcome } from './Welcome';
import { modelNotifications } from './modelNotifications';
import { RuntimeModelsProvider, useRuntimeModels } from './runtimeModels';
import { voiceLanguage, voices } from './modelCatalog';
import { Annotations } from '../project/AnnotationMargin';
import { Binder } from '../project/Binder';
import { trackSidebarPointer } from '../project/sidebarPointer';
import { SourceCard } from '../sources/SourceCard';
import { Reader } from '../sources/Reader';
import { FloatingVaultResults } from '../sources/FloatingVaultResults';
import { useMarginPins } from '../sources/useMarginPins';
import { ordered } from '../project/tree';
import { PathMenu } from '../project/PathMenu';
import { useWorkspace } from './useWorkspace';
import { useMemory } from '../enrichment/useMemory';
import { MemoryReader } from '../enrichment/MemoryReader';
import { TagFilterView } from '../tags/TagFilterView';
import { OutlineDetails } from '../tags/OutlineDetails';
import { effectiveTags, type EffectiveTag } from '../tags/model';
import { taggedPassages } from '../tags/passages';
import { measureText } from '../editor/countMetrics';
import { lineReferenceSection } from '../tags/properties';
import { ViewTitleCapsuleProvider, type TitleView } from '../components/ViewTitleCapsule';
import { WorkspaceNotices } from './WorkspaceNotices';
import { useTitleNotices } from './useTitleNotices';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import { WorkspaceScreenHost } from '../components/WorkspaceScreen';
import type { Settings as WritingSettings } from '../contracts/settings';
import type { Source } from '../contracts/sources';
import { countVaultNotes } from '../sources/countNotes';
import type { AnnotationRecorder } from '../voice/types';
import { useSelectionSpeech } from '../voice/useSelectionSpeech';
import { VoiceButton } from '../voice/VoiceButton';
import { Settings } from './Settings';
import { useContextMenu } from '../components/ContextMenu';
import { useScrollActivity } from '../components/useScrollActivity';
import { SidebarDock } from '../components/SidebarDock';
import { BinderActions } from '../project/BinderActions';
import { useChromeObstructions } from '../components/useChromeObstructions';
const History = lazy(() => import('../history/History').then((m) => ({ default: m.History })));
export function App() {
  return (
    <RuntimeModelsProvider>
      <WorkspaceApp />
    </RuntimeModelsProvider>
  );
}
function WorkspaceApp() {
  const locale = useLocale();
  const catalog = useRuntimeModels()!;
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxSelection, setInboxSelection] = useState<string | null>(null);
  const resumeInbox = useRef(false);
  const openMenu = useContextMenu();
  const recorder = useRef<AnnotationRecorder | null>(null);
  const finishDictation = useCallback(async () => {
    await recorder.current?.finish();
  }, []);
  const workspace = useWorkspace(finishDictation);
  const pageSurface =
    workspace.surface === 'profile' ||
    workspace.surface === 'preferences' ||
    workspace.surface === 'tags' ||
    workspace.surface === 'entities'
      ? workspace.surface
      : null;
  const pageActive = !!workspace.p && !workspace.newProject && (!!pageSurface || inboxOpen);
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
    if (pageSurface) workspace.close();
  };
  const selectFromChrome = (id: string) => {
    if (pageBusy) return;
    closePage();
    void workspace.select(id);
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
        : workspace.editor.current;
    if (destination instanceof HTMLElement) destination.focus({ preventScroll: true });
    else destination?.focus();
  }, [pageActive]);
  useEffect(() => {
    if (workspace.surface !== 'none') setInboxOpen(false);
  }, [workspace.surface]);
  useEffect(() => {
    if (workspace.historyMode) setInboxOpen(false);
  }, [workspace.historyMode]);
  useEffect(() => {
    const open = () => {
      if (pageBusyRef.current) return;
      workspace.setSurface('none');
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
                void loadGlobalShortcut().catch(workspace.fail);
            }),
          );
        })
        .catch(workspace.fail);
    if (native) void loadGlobalShortcut().catch(workspace.fail);
    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
      window.removeEventListener('ariane-inbox-open', open);
    };
  }, []);
  useEffect(() => {
    if (resumeInbox.current && !workspace.newProject && workspace.p) {
      resumeInbox.current = false;
      setInboxOpen(true);
    }
  }, [workspace.newProject, workspace.p?.path]);
  const manager = useEntityManager(
    workspace.p?.path,
    workspace.sourceVersion + workspace.doc.generation,
  );
  const [queryFilter, setQueryFilter] = useState<{
    path: string;
    query: StructuredQuery;
    name?: string;
  } | null>(null);
  const memory = useMemory(workspace, catalog.status?.installed.includes('memory') ?? false);
  const inlineEntities = useInlineEntities(
    workspace,
    memory.result,
    memory.entityError,
    memory.entityRevision,
  );
  const [lineDetail, setLineDetail] = useState<{
    project: string;
    section: string;
    node: string;
  } | null>(null);
  const lineDetailVisible =
    lineDetail?.project === workspace.p?.path &&
    workspace.p?.sections.some(
      (s) =>
        s.id === lineDetail?.section && s.outline?.nodes.some((n) => n.id === lineDetail?.node),
    ) &&
    !workspace.historyMode;
  useEffect(() => {
    setLineDetail(null);
  }, [workspace.p?.path, workspace.active, workspace.historyMode]);
  const [tagFilter, setTagFilter] = useState<{ project: string; id: string } | null>(null);
  const [tagViewMode, setTagViewMode] = useState<'text' | 'table'>('text');
  useEffect(() => setTagViewMode('text'), [workspace.p?.path]);
  const singleTag =
    workspace.p?.path === tagFilter?.project
      ? workspace.p?.smartTags?.find((tag) => tag.id === tagFilter?.id)
      : undefined;
  const structuredFilter = queryFilter?.path === workspace.p?.path ? queryFilter : null;
  let queryLabelText = '',
    queryError = '';
  let projected: import('../tags/passages').TagPassage[] = [];
  let ambiguous = 0,
    pendingAnalysis = 0;
  if (structuredFilter && workspace.p) {
    try {
      queryLabelText = queryLabel(
        structuredFilter.query,
        workspace.p.smartTags ?? [],
        manager.catalog,
      );
      const evaluated = evaluateQuery(
        workspace.p,
        structuredFilter.query,
        manager.catalog,
        [
          ...inlineEntities.batches,
          ...manager.batches.filter(
            (b) =>
              !inlineEntities.batches.some((l) => l.section === b.section && l.text === b.text),
          ),
        ],
        manager.sources,
      );
      projected = evaluated.passages;
      ambiguous = evaluated.ambiguous;
      pendingAnalysis = evaluated.pending;
    } catch (e) {
      queryError = localizeMessage(e);
    }
  }
  const filteredTag = structuredFilter
    ? {
        id: 'structured',
        name: structuredFilter.name ?? queryLabelText ?? t('Recherche structurée'),
        color: '#74786a',
        category: '',
      }
    : singleTag;
  const filterPassages = structuredFilter
    ? projected
    : workspace.p && singleTag
      ? taggedPassages(workspace.p, singleTag.id)
      : [];
  const filterCounts = useMemo(() => {
    const text = filterPassages.map((passage) => passage.text).join('\n');
    return {
      ...measureText({ id: 'filter', version: 0, text }),
      lines: text ? text.split('\n').length : 0,
    };
  }, [filterPassages]);
  useEffect(() => {
    if (tagFilter && !singleTag) setTagFilter(null);
  }, [tagFilter, singleTag]);
  const filterSection = useRef(workspace.active);
  useEffect(() => {
    if (filterSection.current !== workspace.active) {
      setTagFilter(null);
      setQueryFilter(null);
    }
    filterSection.current = workspace.active;
  }, [workspace.active]);
  useEffect(() => {
    if (workspace.palette || workspace.historyMode) {
      setTagFilter(null);
      setQueryFilter(null);
    }
  }, [workspace.palette, workspace.historyMode]);
  const openTagFilter = (id: string) => {
    setQueryFilter(null);
    setLineDetail(null);
    if (!workspace.p) return;
    workspace.setSurface('none');
    workspace.setHistoryMode(false);
    workspace.setPalette(null);
    workspace.setReader(null);
    workspace.setCard(null);
    memory.close();
    inlineEntities.close();
    setTagFilter({ project: workspace.p.path, id });
  };
  const closeTagFilter = () => {
    setTagFilter(null);
    setQueryFilter(null);
    requestAnimationFrame(() => workspace.editor.current?.focus());
  };
  useEffect(() => {
    document.documentElement.lang = locale;
    if (native)
      void request('appLanguage', { value: locale })
        .then(() => request('appShortcuts', { bindings: nativeBindings() }))
        .catch(workspace.fail);
  }, [locale, workspace.fail]);
  const scrollActivity = useScrollActivity();
  useEffect(() => {
    if (workspace.reader || memory.view || workspace.annotationsOpen || workspace.palette)
      setLineDetail(null);
  }, [workspace.reader, memory.view, workspace.annotationsOpen, workspace.palette]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [variantsRequest, setVariantsRequest] = useState(0);
  useEffect(() => {
    if (!workspace.historyMode) setVariantsRequest(0);
  }, [workspace.historyMode]);
  const branches = useWritingBranches({
    path: workspace.p?.path ?? null,
    generation: workspace.doc.generation,
    checkpoint: async () => {
      await finishDictation();
      await workspace.doc.checkpoint();
    },
    onChanged: (project) => {
      workspace.activate(project);
      workspace.setHistoryMode(false);
      workspace.setSurface('none');
      setVariantsRequest(0);
    },
    onError: workspace.fail,
  });
  const docLanguage = workspace.doc.settings.language;
  const readingLanguage = catalog.preferred === 'auto' ? voiceLanguage(docLanguage) : catalog.preferred;
  const hasVoice = readingLanguage && catalog.status?.installed.includes(voices[readingLanguage].id);
  const speech = useSelectionSpeech(
    workspace.editor,
    readingLanguage ?? 'fr',
    [
      workspace.p?.path,
      branches.state?.activeBranch,
      workspace.active,
      workspace.historyMode,
      workspace.surface,
      workspace.reader?.id,
      pageActive,
    ].join('|'),
    workspace.fail,
  );
  const titleNotices = useTitleNotices(workspace, memory.pending);
  const createNote = useNoteCreation(workspace);

  useNoteObservations({
    path: workspace.p?.path,
    activity: workspace.activity,
    active: workspace.active,
    sources: workspace.sources,
    card: workspace.card?.source ?? null,
    reader: workspace.reader,
    batches: inlineEntities.batches,
    result: memory.result,
    node: memory.anchor?.node,
  });
  useEffect(() => {
    if (import.meta.env.VITE_PERFORMANCE === '1')
      void import('../performance/native')
        .then(({ attach }) => attach(workspace, memory))
        .catch((error) => {
          document.title = `ariane — recette : ${String(error)}`;
        });
  });
  const [textSelection, setTextSelection] = useState<SelectionAnchor | null>(null);
  const [lines, setLines] = useState(1);
  const [characters, setCharacters] = useState(0);
  const [focusPreview, setFocusPreview] = useState<WritingSettings['focus'] | null>(null);
  const [fontPreview, setFontPreview] = useState<WritingSettings['font'] | null>(null);
  const [scrollPreview, setScrollPreview] = useState<boolean | null>(null);
  useEffect(() => {
    if (workspace.surface !== 'settings') {
      setFocusPreview(null);
      setFontPreview(null);
      setScrollPreview(null);
    }
  }, [workspace.surface]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [associated, setAssociated] = useState<Set<string>>(new Set());
  const [associationVersion, setAssociationVersion] = useState(0);
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [versionToolsHost, setVersionToolsHost] = useState<HTMLDivElement | null>(null);
  const [appRoot, setAppRoot] = useState<HTMLDivElement | null>(null);
  useChromeObstructions(appRoot, workspace.binder, workspace.historyMode);
  const panelMode = workspace.palette ? 'search' : voiceOpen ? 'voice' : 'none';
  const { lastPanel, morphPanel } = useBottomPanel(panelNode, panelMode);
  useEffect(() => {
    if (workspace.palette) {
      setVoiceOpen(false);
      if (workspace.surface === 'settings') workspace.setSurface('none');
    }
  }, [workspace.palette]);
  useEffect(() => {
    if (!workspace.searching) workspace.editor.current?.clearTextSearch();
    else workspace.editor.current?.findText(workspace.searchQuery, 'first');
  }, [workspace.palette, workspace.searchQuery, workspace.active, workspace.doc.generation]);
  const {
    fail,
    doc,
    surface,
    setSurface,
    binder,
    setBinder,
    setPalette,
    words,
    setWords,
    card,
    setCard,
    reader,
    setReader,
    searching,
    setSearch,
    groupOpen,
    setGroupOpen,
    ready,
    createPage,
    menu,
    setMenu,
    newProject,
    setNewProject,
    serial,
    editor,
    cursor,
    activate,
    p,
    active,
    selected,
    scenes,
    select,
    onVisible,
    commands,
    move,
    cite,
    read,
    update,
    groups,
  } = workspace;
  const documentOpen = reader?.kind === 'PDF' || reader?.kind === 'Image';
  const focusActive =
    !!doc.settings.immersiveFocus &&
    !documentOpen &&
    !workspace.annotationsOpen &&
    !workspace.historyMode &&
    surface === 'none' &&
    !newProject &&
    !workspace.newSection;
  const pinSection = workspace.editor.current?.context()?.section ?? workspace.scenes[0]?.id;
  const marginPins = useMarginPins(p?.path, pinSection, associationVersion, workspace.activity);
  const pinIds = new Set(marginPins.sources.map((s) => s.id));
  const pinSource = (source: Source) =>
    void marginPins.pin(source).then((added) => {
      if (added) setGroupOpen('pinned');
    });
  const marginPinFor = (source: Source) => ({
    canPin: !!pinSection,
    busy: marginPins.busy,
    pinned: pinIds.has(source.id),
    error: marginPins.error,
    onPin: () => pinSource(source),
  });
  const visibleGroups = [
    ...(marginPins.sources.length
      ? [{ id: 'pinned', top: workspace.marginBounds?.top ?? 55, sources: marginPins.sources }]
      : []),
    ...groups
      .map((g) => ({ ...g, sources: g.sources.filter((s) => !pinIds.has(s.id)) }))
      .filter((g) => g.sources.length),
  ];
  const sourcePresence = usePresenceValue(visibleGroups.length ? visibleGroups : null);
  const cardPresence = usePresenceValue(card);
  const [expandedHeight, setExpandedHeight] = useState(400);
  const [groupHeights, setGroupHeights] = useState(() => new Map<string, number>());
  const [railScroll, setRailScroll] = useState(0);
  useLayoutEffect(() => {
    if (!card) return;
    const panel = document.querySelector<HTMLElement>('.source-card');
    if (!panel) return;
    const measure = () => setExpandedHeight(Math.max(54, panel.offsetHeight));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(panel);
    return () => observer?.disconnect();
  }, [card?.source.id]);
  const railGroups = marginLayout(
    sourcePresence.value ?? [],
    groupOpen,
    cardPresence.value?.source.id,
    expandedHeight,
    groupHeights,
  );

  useEffect(() => {
    let alive = true;
    setAssociated(new Set());
    if (p && active && !doc.settings.continuous) {
      void request('links', { section: active })
        .then((links) => {
          if (alive) setAssociated(new Set(links.map((source) => source.id)));
        })
        .catch(() => {
          /* Association status is unknown when links cannot be loaded. */
        });
    }
    return () => {
      alive = false;
    };
  }, [p?.path, active, doc.settings.continuous, associationVersion]);
  const contextTop =
    memory.top === null
      ? null
      : Math.max(memory.top, ...railGroups.map((g) => g.top + g.height + 36)) - railScroll;
  const recallSection =
    memory.suggestion?.kind === 'recall' ? memory.suggestion.passage.section : null;
  const suggestionExcerpt =
    memory.suggestion?.kind === 'recall'
      ? memory.suggestion.passage.quote
      : memory.suggestion?.kind === 'evidence'
        ? memory.suggestion.evidence.quote
        : '';
  const suggestionTitle =
    memory.suggestion?.kind === 'recall'
      ? p?.sections.find((section) => section.id === recallSection)?.title ||
        t('Dans votre manuscrit')
      : memory.suggestion?.kind === 'evidence'
        ? memory.suggestion.evidence.title
        : memory.result?.entities[0]?.title || t('Fiche du manuscrit');
  const railLeft = workspace.marginBounds
    ? Math.max(workspace.marginBounds.right + 32, innerWidth - 215)
    : 0;
  const railWidth = Math.max(0, Math.min(190, innerWidth - railLeft - 25));
  const removeTagAssignment = async (assignment: EffectiveTag) => {
    if (
      assignment.node &&
      editor.current?.removeSmartTag(assignment.section, assignment.node, assignment.tag.id)
    ) {
      setLineDetail((current) => (current ? { ...current } : current));
      return;
    }
    await doc.removeTagAssignment(assignment.section, assignment.node, assignment.tag.id);
  };
  const tagRemovalLabel = (assignment: EffectiveTag) => {
    const owner = p?.sections.find((s) => s.id === assignment.section),
      node = owner?.outline?.nodes.find((n) => n.id === assignment.node);
    const origin = node
      ? owner!.title + ' · ' + owner!.text.slice(node.start).split('\n')[0].slice(0, 60)
      : (owner?.title ?? '');
    return t('Retirer le tag {0} de {1}', { 0: assignment.tag.name, 1: origin });
  };
  const railVisible = !!workspace.marginBounds && railWidth >= 150;
  const contextVisible =
    !workspace.annotationsOpen &&
    railVisible &&
    contextTop !== null &&
    contextTop + (suggestionExcerpt ? 125 : 80) < (workspace.marginBounds?.bottom ?? 0);
  const pathNotices = titleNotices.notices.map((notice) => ({
    id: notice.id,
    message: localizeMessage(notice.message),
    tone: notice.tone,
    action:
      notice.kind === 'library' &&
      notice.libraryNotice === workspace.libraryNotice &&
      notice.libraryNotice?.undo &&
      p?.canUndoStructure
        ? {
            label: t('Annuler'),
            disabled: workspace.libraryBusy,
            onClick: () => {
              titleNotices.dismiss(notice);
              void workspace.operate({ action: 'undo' });
            },
          }
        : notice.kind === 'version' && doc.versionStatus === 'error'
          ? { label: t('Réessayer'), onClick: () => void doc.checkpoint().catch(fail) }
          : (notice.kind === 'error' || notice.kind === 'save') &&
              !workspace.error.startsWith('EXTERNAL:') &&
              doc.status === 'error'
            ? {
                label: t('Réessayer'),
                onClick: () => {
                  titleNotices.dismiss(notice);
                  if (doc.status === 'error') void doc.flush().catch(fail);
                },
              }
            : notice.kind === 'index'
              ? { label: t('Suspendre'), onClick: () => void request('cancelIndex').catch(fail) }
              : notice.kind === 'export'
                ? {
                    label: t('Voir'),
                    onClick: () => {
                      titleNotices.dismiss(notice);
                      setSurface('export');
                    },
                  }
                : notice.kind === 'vault-access'
                  ? { label: t('Autoriser les dossiers'), onClick: () => setSurface('sources') }
                  : undefined,
    showDetails:
      (notice.kind === 'error' &&
        (workspace.error.startsWith('EXTERNAL:') || doc.status !== 'error')) ||
      notice.kind === 'recovery' ||
      notice.kind === 'index',
    onDismiss: () => titleNotices.dismiss(notice),
  }));
  const renderCapsule = (view?: TitleView) => (
    <PathMenu
      project={view?.home ? undefined : (p ?? undefined)}
      view={view}
      selected={selected}
      continuous={doc.settings.continuous}
      onSelect={selectFromChrome}
      onAdd={(parent) => {
        if (!pageBusy)
          void createPage(parent, doc.settings.continuous ? 'manuscript' : selected?.role);
      }}
      notifications={[
        ...pathNotices.filter((notice) => notice.tone === 'error'),
        ...modelNotifications(catalog, locale),
        ...pathNotices.filter((notice) => notice.tone !== 'error'),
      ]}
      hasPending={titleNotices.hasPending}
      hasError={titleNotices.hasError}
      noticeDetails={<WorkspaceNotices workspace={workspace} embedded />}
      hasVariants={branches.state?.branches.some((branch) => !branch.isMain) ?? false}
      branchName={
        view && !view.keepBranch
          ? undefined
          : (() => {
              const branch = branches.state?.branches.find(
                (item) => item.id === branches.state?.activeBranch,
              );
              return branch ? (branch.isMain ? t('Texte principal') : branch.name) : undefined;
            })()
      }
      branchMenu={
        (!view || view.keepBranch) && branches.state
          ? (close) => (
              <BranchMenu
                state={branches.state!}
                busy={branches.busy || historyBusy || workspace.libraryBusy}
                onSwitch={async (id) => {
                  await branches.switchBranch(id);
                  close();
                }}
                onManage={() => {
                  close();
                  setVariantsRequest((value) => value + 1);
                  setSurface('history');
                }}
              />
            )
          : undefined
      }
    />
  );
  // Project pages share the app's title capsule and chrome.
  const pageTitle = inboxOpen
    ? t('Boîte de réception')
    : pageSurface
      ? {
          profile: t('Profil'),
          preferences: t('Paramètres'),
          tags: t('Smart-tags'),
          entities: t('Entités'),
        }[pageSurface]
      : undefined;
  const currentView: TitleView | undefined = pageActive
    ? { title: pageTitle!, onBack: closePage }
    : filteredTag
      ? {
          title: structuredFilter ? t('Recherche structurée') : t('Vue filtrée par smart-tag'),
          trail: [structuredFilter ? queryLabelText : '#' + filteredTag.name],
          onBack: closeTagFilter,
        }
      : workspace.historyMode
        ? {
            title: t('Versions'),
            keepBranch: true,
            onBack: () => {
              workspace.setHistoryMode(false);
              setSurface('none');
            },
          }
        : undefined;
  const inbox = inboxOpen ? (
    <Inbox
      project={p}
      branches={branches.state}
      onBranch={branches.switchBranch}
      branchName={branches.state?.branches.find((b) => b.id === branches.state?.activeBranch)?.name}
      selectedId={inboxSelection}
      onSelection={setInboxSelection}
      onClose={() => setInboxOpen(false)}
      onError={fail}
      onNotice={(message) => workspace.setLibraryNotice({ message, undo: false })}
      onBeforeTransfer={async () => {
        await doc.checkpoint();
        await workspace.activity.flush();
      }}
      onOpenProject={async (path) => {
        await workspace.openProject(path);
      }}
      onCreate={() => {
        void doc
          .checkpoint()
          .then(() => {
            resumeInbox.current = true;
            setInboxOpen(false);
            workspace.setNewProject(true);
          })
          .catch(fail);
      }}
      onTransferred={async () => {
        if (!doc.ref.current) return;
        const path = doc.ref.current.path;
        await doc.flush();
        const fresh = await request('open', { path });
        if (doc.ref.current?.path !== path) throw Error('Le projet actif a changé.');
        doc.replaceSections(fresh.sections, false, fresh.canUndoStructure);
      }}
      onImported={async (section) => {
        if (!doc.ref.current) return;
        await doc.flush();
        const fresh = await request('open', { path: doc.ref.current.path });
        if (!fresh.sections.some((s) => s.id === section))
          throw Error(
            'Le texte rangé est absent de cette variante ou a été retiré. La capture est conservée.',
          );
        fresh.settings = {
          ...fresh.settings,
          active: section,
          continuous: false,
          libraryView: 'texts',
        };
        activate(fresh);
        setInboxOpen(false);
      }}
    />
  ) : null;
  if (!ready) return <div className="boot" aria-label={t('Ouverture du projet')} />;
  if (!p || newProject)
    return (
      <ViewTitleCapsuleProvider value={renderCapsule}>
        <WindowDragRegion onError={workspace.fail} />
        <Welcome
          onModels={() => catalog.offer({ key: 'catalog', id: voices[readingLanguage ?? 'fr'].id })}
          beforeOpen={workspace.activity.flush}
          onOpen={activate}
          onError={fail}
        />
        {inbox}
        {newProject && p && (
          <button className="return-project" onClick={() => setNewProject(false)}>
            {t('Revenir au projet')}
          </button>
        )}
      </ViewTitleCapsuleProvider>
    );
  return (
    <ViewTitleCapsuleProvider value={renderCapsule}>
      <div
        ref={setAppRoot}
        style={
          { '--column-width': (doc.settings.columnWidth ?? 750) + 'px' } as React.CSSProperties
        }
        data-page={pageActive || undefined}
        data-macos-window={(native && navigator.platform.startsWith('Mac')) || undefined}
        data-page-busy={(pageActive && pageBusy) || undefined}
        data-scrolling={scrollActivity.scrolling}
        data-focus={focusActive && !pageActive}
        data-writing-font={
          (workspace.surface === 'settings' && !workspace.historyMode ? fontPreview : null) ??
          doc.settings.font
        }
        className={
          'app ' +
          (documentOpen ? 'with-document ' : '') +
          (reader || (memory.view && !memory.origin) ? 'with-reader ' : '') +
          (searching ? 'searching-project ' : '') +
          (workspace.historyMode ? 'versions-mode' : '') +
          (lineDetailVisible ? ' with-line-details' : '')
        }
      >
        <WindowDragRegion onError={workspace.fail} />
        <div className="chrome-blur chrome-blur-top" aria-hidden="true">
          <span />
          <span />
        </div>
        {!binder && (
          <button
            className="edge-trigger"
            aria-label={t('Déplier la sidebar')}
            data-hint={t('Bibliothèque · ⌘ ⇧ B')}
            data-hint-placement="sidebar-edge"
            aria-description={t('Bibliothèque · ⌘ ⇧ B')}
            aria-controls="project-sidebar"
            aria-expanded={false}
            onClick={() => setBinder(true)}
            onPointerMove={trackSidebarPointer}
          >
            <ChevronRight size={17} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
        {!workspace.historyMode && !focusActive && !pageActive && (
          <HistoryEdge
            open={memory.view?.kind === 'resume'}
            disabled={workspace.libraryBusy || historyBusy || branches.busy}
            onToggle={() => {
              setMenu(false);
              if (memory.view?.kind === 'resume') memory.close();
              else memory.open({ kind: 'resume' });
            }}
          />
        )}
        <WorkspaceHeader
          libraryBusy={workspace.libraryBusy || historyBusy || branches.busy || pageBusy}
          binder={binder}
          historyMode={workspace.historyMode}
          pageMode={pageActive}
          immersiveFocus={doc.settings.immersiveFocus}
          onToggleFocus={workspace.toggleFocus}
          menu={menu}
          setMenu={setMenu}
          commands={commands}
        />
        <div className="window-title">{renderCapsule(currentView)}</div>
        <SidebarDock
          expanded={binder}
          dark={workspace.appearance.dark}
          onToggleTheme={() =>
            workspace.appearance.change(workspace.appearance.dark ? 'light' : 'dark')
          }
          busy={workspace.libraryBusy || historyBusy || branches.busy || pageBusy}
        >
          <BinderActions
            currentSurface={inboxOpen ? 'inbox' : pageSurface}
            historyMode={workspace.historyMode}
            trash={doc.settings.libraryView === 'trash'}
            onSurface={(surface) => {
              setInboxOpen(false);
              setSurface(surface);
            }}
            onTrash={() => {
              closePage();
              doc.configure({ libraryView: 'trash' });
              setBinder(true);
            }}
          />
        </SidebarDock>
        <Presence kind="sidebar">
          {binder && (
            <Binder
              key={p.path}
              historyMode={workspace.historyMode}
              footerTarget={null}
              onOperation={workspace.operate}
              onConfigure={doc.configure}
              onReadSource={(source) => {
                closePage();
                void read(source);
              }}
              onOpenProject={workspace.openProject}
              onError={fail}
              sourceVersion={workspace.sourceVersion}
              busy={workspace.libraryBusy || historyBusy || branches.busy || pageBusy}
              project={p}
              active={active}
              reveal={workspace.revealInBinder}
              onRevealed={() => workspace.setRevealInBinder(0)}
              onSelect={selectFromChrome}
              onSurface={(s) => {
                setInboxOpen(false);
                setSurface(s);
                if (!['history', 'preferences', 'profile', 'tags', 'entities'].includes(s))
                  setBinder(false);
              }}
              onClose={() => setBinder(false)}
              onAdd={workspace.startCreation}
              creation={workspace.newSection}
              creationTitle={workspace.newTitle}
              onCreationTitle={workspace.setNewTitle}
              onConfirmCreation={workspace.add}
              onCancelCreation={() => {
                workspace.setNewSection(null);
                workspace.setNewTitle('');
              }}
              onMove={(...args) => void move(...args)}
              onRename={async (id, title) => {
                try {
                  await doc.flush();
                  const section = doc.ref.current?.sections.find((section) => section.id === id);
                  if (section) await update({ ...section, title });
                } catch (error) {
                  fail(error);
                }
              }}
              onPrepare={async (id) => {
                await select(id);
                if (doc.settingsRef.current.active === id) {
                  setSurface('prepare');
                  setBinder(false);
                }
              }}
              onContinuous={() => {
                closePage();
                void select(active || '', true);
              }}
            />
          )}
        </Presence>
        <main
          hidden={pageActive}
          inert={pageActive || workspace.libraryBusy || branches.busy}
          aria-busy={workspace.libraryBusy || historyBusy || branches.busy}
          className={
            'writing-layout' +
            (((surface === 'settings' && !workspace.historyMode ? scrollPreview : null) ??
            doc.settings.typewriter)
              ? ' typewriter'
              : '') +
            (binder ? ' sidebar-open' : '') +
            (workspace.historyMode ? ' history-layout' : '')
          }
        >
          <WritingSurface
            titleTagInput={
              selected
                ? {
                    tags: effectiveTags(p.smartTags ?? [], p.sections, selected.id).map(
                      ({ tag }) => tag,
                    ),
                    create: doc.createSmartTag,
                    assign: (id) => doc.addSectionTag(selected.id, id),
                    open: openTagFilter,
                    remove: (id) => {
                      const assignment = effectiveTags(
                        p.smartTags ?? [],
                        p.sections,
                        selected.id,
                      ).find(({ tag }) => tag.id === id);
                      if (assignment) return removeTagAssignment(assignment);
                    },
                    removalLabel: (id) => {
                      const assignment = effectiveTags(
                        p.smartTags ?? [],
                        p.sections,
                        selected.id,
                      ).find(({ tag }) => tag.id === id);
                      return assignment ? tagRemovalLabel(assignment) : '';
                    },
                    onError: fail,
                    onPending: doc.trackTagWork,
                    registerFlusher: doc.registerTagFlusher,
                  }
                : undefined
            }
            historyMode={workspace.historyMode || !!filteredTag}
            projectName={p.name}
            selected={selected}
            editorRef={editor}
            editorProps={{
              smartTags: p.smartTags,
              tagSections: p.sections,
              createSmartTag: doc.createSmartTag,
              onSmartTag: openTagFilter,
              onRemoveSmartTag: (section, node, id) => {
                const assignment = effectiveTags(p.smartTags ?? [], p.sections, section, node).find(
                  ({ tag }) => tag.id === id,
                );
                if (assignment) return removeTagAssignment(assignment);
              },
              onTagWork: doc.trackTagWork,
              registerTagFlusher: doc.registerTagFlusher,
              onOutlineDetails: (section, node, outline) => {
                const original = p.sections.find((s) => s.id === section);
                if (original && !original.outline)
                  doc.edit(new Map([[section, original.text]]), new Map([[section, outline]]));
                memory.close();
                inlineEntities.close();
                setCard(null);
                workspace.setReader(null);
                workspace.setAnnotationsOpen(false);
                setBinder(false);
                setLineDetail({ project: p.path, section, node });
              },
              sections: scenes,
              generation: doc.generation,
              readOnly:
                pageActive ||
                workspace.historyMode ||
                workspace.libraryBusy ||
                branches.busy ||
                !!filteredTag,
              settings: doc.settings,
              immersiveFocus: focusActive,
              projectPath: p.path,
              noteLookup: (query) => request('noteSuggestions', { projectPath: p.path, query }),
              noteCreate: createNote,
              noteResolve: (ids) => request('noteReferences', { projectPath: p.path, ids }),
              sourceVersion: workspace.sourceVersion,
              onOpenNote: (id) =>
                void read(id, () => {
                  memory.close();
                  inlineEntities.close();
                }),
              onNoteError: fail,
              entities: inlineEntities.batches,
              searchQuery: searching ? workspace.searchQuery : undefined,
              onEntity: (mention) => {
                memory.close();
                void inlineEntities.open(mention);
              },
              focusPreview: surface === 'settings' && !workspace.historyMode ? focusPreview : null,
              scrollPreview:
                surface === 'settings' && !workspace.historyMode ? scrollPreview : null,
              onSelection: setTextSelection,
              onSearchSources: (text) => setSearch(text),
              onWritingEdit: workspace.writingActivity.record,
              onChange: doc.edit,
              onDraftChange: doc.editDraft,
              onVisible: onVisible,
              onWords: setWords,
              onCharacters: setCharacters,
              onLines: setLines,
              onCursor: (v) => (cursor.current = v),
              onTyping: () => {
                memory.onTyping();
                inlineEntities.close();
                serial.current++;
                setCard(null);
              },
            }}
            onScroll={scrollActivity.onScroll}
            onScrollEnd={scrollActivity.onScrollEnd}
            onTitle={(title) => {
              if (selected) return update({ ...selected, title }).catch(fail);
            }}
            onChooseTexts={() => {
              setBinder(true);
              workspace.setRevealInBinder((v) => v + 1);
            }}
            onAdd={() => void createPage(active)}
          >
            <EntityProposal entities={inlineEntities} />
          </WritingSurface>
          {filteredTag && (
            <TagFilterView
              key={p.path + ':' + filteredTag.id}
              project={p}
              tag={filteredTag}
              heading={
                structuredFilter
                  ? (structuredFilter.name ?? queryLabelText ?? t('Recherche structurée'))
                  : undefined
              }
              notice={
                structuredFilter && (queryError || ambiguous > 0 || pendingAnalysis > 0)
                  ? queryError ||
                    (ambiguous
                      ? t('Des mentions homonymes restent à résoudre : {0}', { 0: ambiguous })
                      : t('Mentions en attente d’actualisation'))
                  : undefined
              }
              mode={tagViewMode}
              passages={filterPassages}
              batches={inlineEntities.batches}
              onTag={openTagFilter}
              onRemove={structuredFilter ? undefined : removeTagAssignment}
              removalLabel={tagRemovalLabel}
              onError={fail}
              onRelation={(relation) => {
                if (relation.kind === 'line') {
                  setTagFilter(null);
                  const section = lineReferenceSection(p, relation.section, relation.node);
                  if (section) void workspace.locatePassage(section, relation.node, relation.title);
                  else fail(t('La ligne liée n’est plus disponible.'));
                } else void read(relation.id, () => setTagFilter(null));
              }}
              onClose={closeTagFilter}
              onOpen={(passage) => {
                const live = doc.ref.current;
                const original =
                  live?.path === p.path
                    ? live.sections.find((s) => s.id === passage.section && !s.trashed)
                    : undefined;
                if (
                  !original ||
                  (passage.node && !original.outline?.nodes.some((n) => n.id === passage.node))
                ) {
                  fail(t('La ligne liée n’est plus disponible.'));
                  return;
                }
                setTagFilter(null);
                setQueryFilter(null);
                requestAnimationFrame(
                  () => void workspace.locatePassage(passage.section, passage.node, passage.text),
                );
              }}
            />
          )}
          {workspace.historyMode && (
            <Suspense fallback={<p className="history-empty">{t('Ouverture des versions…')}</p>}>
              <History
                key={p.path + ':' + variantsRequest}
                initialTab={variantsRequest ? 'variants' : 'changes'}
                project={p}
                active={active}
                flush={doc.flush}
                checkpoint={doc.checkpoint}
                versionRevision={doc.versionRevision}
                onBusyChange={setHistoryBusy}
                onClose={() => {
                  workspace.setHistoryMode(false);
                  setVariantsRequest(0);
                  setSurface('none');
                }}
                toolsHost={versionToolsHost}
                toolsOpen={surface === 'settings'}
                onCloseTools={() => {
                  setSurface('none');
                  settingsTrigger.current?.focus();
                }}
                onRestore={activate}
                onApply={workspace.apply}
                onError={fail}
                onSelectText={(id) => void select(id)}
              />
            </Suspense>
          )}
        </main>
        <main
          ref={setPageHost}
          className={'workspace-page-layout' + (binder ? ' sidebar-open' : '')}
          hidden={!pageActive}
          inert={workspace.libraryBusy || historyBusy || branches.busy}
          aria-busy={workspace.libraryBusy || historyBusy || branches.busy}
        />
        <div className="writing-tools" hidden={pageActive} inert={pageActive}>
          <SelectionToolbar
            anchor={searching || workspace.historyMode || !!filteredTag ? null : textSelection}
            onFormat={(format) => editor.current?.format(format)}
            onAnnotate={native ? workspace.openAnnotations : undefined}
            onListen={native ? () => {
              if (speech.reading || hasVoice) {
                void speech.toggle();
                return;
              }
              catalog.offer({
                key: 'reading',
                id: voices[readingLanguage ?? 'fr'].id,
                preference: readingLanguage ? catalog.preferred : 'fr',
              });
            } : undefined}
            needsVoice={native && !hasVoice}
            reading={speech.reading}
            onTry={() => editor.current?.writingAid('trial-start')}
          />
          {lineDetailVisible && lineDetail && !filteredTag && (
            <OutlineDetails
              project={p}
              section={lineDetail.section}
              node={lineDetail.node}
              batches={inlineEntities.batches}
              onChange={(field, value) => {
                if (
                  editor.current?.setLineProperty(lineDetail.section, lineDetail.node, field, value)
                )
                  setLineDetail((current) => (current ? { ...current } : current));
              }}
              onClose={() => {
                setLineDetail(null);
                editor.current?.focus();
              }}
              onManage={() => setSurface('tags')}
              onRemove={removeTagAssignment}
              removalLabel={tagRemovalLabel}
              onError={fail}
              onFilter={openTagFilter}
              onOpen={(relation) => {
                setLineDetail(null);
                if (relation.kind === 'line') {
                  const section = lineReferenceSection(p, relation.section, relation.node);
                  if (section) void workspace.locatePassage(section, relation.node, relation.title);
                  else fail(t('La ligne liée n’est plus disponible.'));
                } else void read(relation.id);
              }}
            />
          )}
          {workspace.annotationsOpen &&
            !workspace.historyMode &&
            !filteredTag &&
            !lineDetailVisible && (
              <Annotations
                key={p.path + ':' + branches.state?.activeBranch}
                recorder={recorder}
                branch={branches.state?.activeBranch}
                onManage={() => setSurface('sources')}
                onDocument={(source, a, replacing) => {
                  workspace.setAnnotationsOpen(false);
                  workspace.setReader({
                    ...source,
                    page: replacing ? source.page : a.document!.page,
                    reveal: replacing ? undefined : a.document,
                    replacement: replacing ? a : undefined,
                  });
                }}
                workspace={workspace}
                left={railVisible ? railLeft : Math.max(12, innerWidth - 290)}
                width={railVisible ? railWidth : 270}
              />
            )}
          {!workspace.annotationsOpen &&
            !workspace.historyMode &&
            !filteredTag &&
            !lineDetailVisible &&
            (words > 0 || marginPins.sources.length > 0) &&
            railVisible &&
            !(reader || (memory.view && !memory.origin)) && (
              <DocumentaryMargin
                setGroupHeights={setGroupHeights}
                setRailScroll={setRailScroll}
                sourcePresence={sourcePresence}
                workspaceMarginBounds={workspace.marginBounds}
                railLeft={railLeft}
                railWidth={railWidth}
                railGroups={railGroups}
                groupOpen={groupOpen}
                colors={doc.settings.entityColors}
                cardPresence={cardPresence}
                expandedHeight={expandedHeight}
                openMenu={openMenu}
                read={read}
                cite={cite}
                card={card}
                setSurface={setSurface}
                setCard={setCard}
                associated={associated}
                marginPins={marginPins}
                setGroupOpen={setGroupOpen}
                hasSuggestion={!!memory.suggestion}
                contextTop={contextTop}
                railScroll={railScroll}
                suggestionExcerpt={suggestionExcerpt}
              />
            )}
          <Presence kind="anchored">
            {!workspace.historyMode &&
              !filteredTag &&
              !lineDetailVisible &&
              memory.suggestion &&
              contextVisible &&
              doc.settings.focus === 'none' &&
              !memory.view &&
              !reader && (
                <MemorySuggestion
                  contextTop={contextTop}
                  railLeft={railLeft}
                  railWidth={railWidth}
                  memory={memory}
                  openMenu={openMenu}
                  setSurface={setSurface}
                  suggestionExcerpt={suggestionExcerpt}
                  colors={doc.settings.entityColors}
                  suggestionTitle={suggestionTitle}
                  fail={fail}
                  editor={editor}
                />
              )}
          </Presence>
          <MemoryReader
            memory={memory}
            workspace={workspace}
            projectMenuOpen={menu}
            writingMenuOpen={surface === 'settings'}
          />
          <Presence kind="anchored">
            {card && (
              <SourceCard
                key={card.source.id}
                origin={card.origin}
                source={card.source}
                marginPin={marginPinFor(card.source)}
                sections={p.sections}
                contentVersion={`${doc.status}:${doc.generation}`}
                onOccurrence={(hit) => void workspace.locateSourceMatch(hit, hit.matched)}
                citationStyle={doc.settings.citationStyle}
                colors={doc.settings.entityColors}
                onRegister={(s, t) => workspace.registerCitation(s, t).catch(fail)}
                top={card.top}
                onClose={() => setCard(null)}
                onRead={() => void read(card.source)}
                onAssociate={() =>
                  void request('associate', {
                    section: active!,
                    id: card.source.id,
                    payload: card.source,
                  })
                    .then(() => {
                      void workspace.activity.record({
                        kind: 'associated',
                        title: card.source.title,
                        sourceId: card.source.id,
                        section: active,
                      });
                      setCard(null);
                      setAssociationVersion((version) => version + 1);
                      setSurface('prepare');
                    })
                    .catch(fail)
                }
                onCite={(s, t) => void cite(s, t)}
              />
            )}
          </Presence>
          <Presence>
            {reader && (
              <Reader
                key={JSON.stringify([
                  p.path,
                  branches.state?.activeBranch,
                  reader.id,
                  reader.fingerprint,
                  reader.reveal?.page ?? reader.page,
                  reader.replacement?.id,
                  reader.reveal?.rectangles,
                ])}
                source={reader}
                reveal={reader.reveal}
                replacing={!!reader.replacement}
                onDocumentSelect={async (anchor) => {
                  const branch = branches.state?.activeBranch;
                  if (!branch || branches.busy) throw new Error(t('La variante active a changé.'));
                  if (!reader.replacement) {
                    return workspace.linkDocument(anchor, branch);
                  }
                  const a = reader.replacement;
                  const current = workspace.beginReaderRequest();
                  await request('updateAnnotation', {
                    projectPath: p.path,
                    id: a.id,
                    revision: a.revision,
                    note: a.note,
                    done: a.done,
                    document: anchor,
                    branch,
                  });
                  if (current()) {
                    setReader(null);
                    workspace.setAnnotationTarget(null);
                    workspace.setAnnotationsOpen(true);
                  }
                }}
                marginPin={marginPinFor(reader)}
                sections={p.sections}
                contentVersion={`${doc.status}:${doc.generation}`}
                onOccurrence={(hit) => void workspace.locateSourceMatch(hit, hit.matched)}
                onCite={(quote) => cite(reader, quote)}
                onClose={() => {
                  setReader(null);
                  if (reader.reveal || reader.replacement) workspace.setAnnotationsOpen(true);
                }}
                projectPath={p.path}
                onChange={(source) => {
                  if (doc.ref.current?.path === p.path) {
                    void workspace.activity.record({
                      kind: 'updated',
                      title: source.title,
                      sourceId: source.id,
                      section: active,
                    });
                    setReader((current) =>
                      current?.id === source.id ? { ...current, ...source } : current,
                    );
                    workspace.refreshEnrichment();
                    workspace.setSourceVersion((v) => v + 1);
                  }
                }}
                onRead={(id) => void read(id)}
                onLocate={(section, node, quote) =>
                  void workspace.locatePassage(section, node, quote)
                }
              />
            )}
          </Presence>{' '}
          <footer className="statusbar">
            <div className="chrome-blur chrome-blur-bottom" aria-hidden="true">
              <span />
              <span />
            </div>
            <div
              className="bottom-controls"
              inert={historyBusy || branches.busy}
              data-panel={panelMode}
              data-anchor={panelMode === 'none' ? lastPanel.current : panelMode}
              data-morph={morphPanel}
            >
              <div className="bottom-connector" aria-hidden="true" />
              <VoiceButton
                ref={recorder}
                beforeRecording={speech.stop}
                needsInstall={!!catalog.status && !catalog.status.installed.includes('voice')}
                onInstall={() => catalog.offer({ key: 'voice', id: 'voice' })}
                projectPath={p?.path}
                language={doc.settings.language}
                onActivity={memory.setRecording}
                prepareInsertion={() => editor.current?.prepareInsertion() ?? (() => false)}
                panel={panelNode}
                retainContent={panelMode === 'none'}
                open={voiceOpen && !workspace.palette}
                onOpen={() => {
                  setTagFilter(null);
                  setPalette(null);
                  workspace.setHistoryMode(false);
                  if (surface === 'settings') setSurface('none');
                  setVoiceOpen(true);
                }}
                onClose={() => setVoiceOpen(false)}
              />
              <WritingCounter
                words={filteredTag ? filterCounts.words : words}
                characters={filteredTag ? filterCounts.characters : characters}
                lines={filteredTag ? filterCounts.lines : lines}
                notes={countVaultNotes([...workspace.sources, ...marginPins.sources])}
                notesStatus={workspace.sourceStatus}
                hideNotes={focusActive}
                mode={focusActive ? 'words' : doc.settings.countMode}
                onChange={(countMode) => {
                  doc.configure({ countMode });
                  if (!filteredTag) editor.current?.focus();
                }}
              />
              <Palette
                open={!!workspace.palette}
                sections={workspace.palette === 'sections'}
                textSearch={workspace.palette === 'text'}
                searchScope={p.path}
                initialQuery={workspace.initialSearch}
                onTextSearch={(query) => workspace.setSearchQuery(query)}
                onOpenPanel={() => workspace.captureSplitPreview(!pageActive && !filteredTag)}
                extraResults={
                  workspace.palette === 'text' ? (
                    <StructuredSearch
                      query={workspace.searchQuery}
                      project={p}
                      manager={manager}
                      onQuery={(query) => {
                        workspace.setSearch(query);
                      }}
                      onOpen={(query, name) => {
                        workspace.setSearch(null);
                        setTagFilter(null);
                        setQueryFilter({ path: p.path, query, name });
                        workspace.setSurface('none');
                        workspace.setReader(null);
                        workspace.setCard(null);
                        memory.close();
                        inlineEntities.close();
                      }}
                    />
                  ) : undefined
                }
                onNextMatch={(query, backwards) =>
                  editor.current?.findText(query, backwards ? 'previous' : 'next')
                }
                panel={panelNode}
                retainContent={panelMode === 'none'}
                onOpen={() => {
                  setVoiceOpen(false);
                  if (surface === 'settings') setSurface('none');
                  setSearch('');
                }}
                onClose={() => {
                  setSearch(null);
                  setCard(null);
                  editor.current?.focus();
                }}
                commands={
                  workspace.palette === 'sections'
                    ? ordered(p.sections).map((section) => ({
                        id: 'section:' + section.id,
                        label: section.title || t('Sans titre'),
                        detail:
                          section.kind === 'scene'
                            ? t('Scène')
                            : section.kind === 'chapter'
                              ? t('Chapitre')
                              : t('Section'),
                        action: () => void select(section.id),
                      }))
                    : [
                        ...commands,
                        ...(workspace.splitPreview &&
                        !pageActive &&
                        !workspace.historyMode &&
                        !filteredTag
                          ? [
                              {
                                id: 'split-scene',
                                label: t('Scinder la scène'),
                                preview: workspace.splitPreview,
                                action: () =>
                                  workspace.confirmSplitPreview(workspace.splitPreview!),
                              },
                            ]
                          : []),
                        {
                          id: 'resume',
                          label: t('Reprendre le fil'),
                          action: () => memory.open({ kind: 'resume' }),
                        },
                        {
                          id: 'manuscript-entities',
                          label: t('Fiches du manuscrit'),
                          action: () => memory.open({ kind: 'list' }),
                        },
                      ].filter((command) => command.id !== 'sources')
                }
              />
              {searching && !/^[#@]/.test(workspace.searchQuery.trim()) && (
                <FloatingVaultResults
                  query={workspace.searchQuery}
                  sources={workspace.vaultSearch.sources}
                  busy={workspace.vaultSearch.busy}
                  error={workspace.vaultSearch.error || marginPins.error}
                  colors={doc.settings.entityColors}
                  pinned={pinIds}
                  pinning={marginPins.busy}
                  canPin={!!pinSection}
                  onOpen={(source) => void read(source)}
                  onPin={pinSource}
                />
              )}
              <div
                ref={setPanelNode}
                id="bottom-writing-panel"
                className="bottom-panel"
                data-open={!!workspace.palette || voiceOpen}
                aria-hidden={!workspace.palette && !voiceOpen}
                inert={!workspace.palette && !voiceOpen}
              />
            </div>
            {!filteredTag && !!selected?.goal && (
              <div className="goal-status">
                <span className="goal-track">
                  <i style={{ width: Math.min(100, (words / selected.goal) * 100) + '%' }} />
                </span>
                <span>{selected.goal.toLocaleString(localeTag())}</span>
              </div>
            )}
            <DepthControl
              disabled={!!filteredTag}
              value={doc.settings.depth}
              onChange={(depth) => doc.configure({ depth })}
            />
            <div className="settings-control" data-open={surface === 'settings'}>
              {filteredTag ? (
                <button
                  className="settings-trigger tag-view-switch"
                  aria-label={
                    tagViewMode === 'text'
                      ? t('Afficher les passages en tableau')
                      : t('Afficher les passages en texte')
                  }
                  data-tooltip={tagViewMode === 'text' ? t('Vue tableau') : t('Vue texte')}
                  aria-pressed={tagViewMode === 'table'}
                  onClick={() => setTagViewMode((mode) => (mode === 'text' ? 'table' : 'text'))}
                >
                  {tagViewMode === 'text' ? <Table2 size={16} /> : <AlignLeft size={16} />}
                </button>
              ) : (
                <>
                  <button
                    ref={settingsTrigger}
                    className="settings-trigger"
                    aria-label={
                      workspace.historyMode ? t('Outils des versions') : t('Réglages d’écriture')
                    }
                    data-tooltip={
                      workspace.historyMode ? t('Outils des versions') : t('Écriture et lecture')
                    }
                    aria-expanded={surface === 'settings'}
                    aria-controls={workspace.historyMode ? 'version-settings' : 'writing-settings'}
                    onClick={() => {
                      setPalette(null);
                      setVoiceOpen(false);
                      setCard(null);
                      if (memory.origin) memory.close();
                      setSurface(surface === 'settings' ? 'none' : 'settings');
                    }}
                  >
                    {workspace.historyMode ? (
                      <GitCompareArrows size={16} aria-hidden="true" />
                    ) : (
                      'Aa'
                    )}
                  </button>
                  {workspace.historyMode ? (
                    <div ref={setVersionToolsHost} />
                  ) : (
                    <Settings
                      open={surface === 'settings'}
                      value={doc.settings}
                      onChange={doc.configure}
                      onFocusPreview={setFocusPreview}
                      onFontPreview={setFontPreview}
                      onScrollPreview={setScrollPreview}
                      canFormat={scenes.length > 0}
                      onFormat={(format) => editor.current?.format(format)}
                      onClose={() => {
                        setSurface('none');
                        settingsTrigger.current?.focus();
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </footer>
        </div>
        <WorkspaceScreenHost value={pageHostContext}>
          {inbox}
          {surface === 'entities' && (
            <EntityManager
              project={p}
              manager={manager}
              batches={inlineEntities.batches}
              onClose={workspace.close}
              onError={fail}
              onChanged={() => workspace.setSourceVersion((v) => v + 1)}
              onPassage={(section, node, quote) => {
                workspace.close();
                void workspace.locatePassage(section, node, quote);
              }}
              onSource={(id) => void read(id, workspace.close)}
            />
          )}
          <WorkspaceDialogs
            onTagFilter={openTagFilter}
            onNotice={titleNotices.notify}
            onLoading={titleNotices.setDialogLoading}
            workspace={workspace}
            onMemory={() => memory.open({ kind: 'list' })}
          />
        </WorkspaceScreenHost>
      </div>
    </ViewTitleCapsuleProvider>
  );
}
