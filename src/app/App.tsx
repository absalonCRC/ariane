import { WindowDragRegion } from './chrome/WindowDragRegion';
import { useNoteObservations } from '../notes/useNoteObservations';
import { WritingSurface } from './writing/WritingSurface';
import { useBottomPanel } from './chrome/useBottomPanel';
import { MemorySuggestion } from '../enrichment/MemorySuggestion';
import { DocumentaryMargin } from '../sources/margin/DocumentaryMargin';
import { WorkspaceHeader } from './chrome/WorkspaceHeader';
import { BranchMenu } from '../history/BranchMenu';
import { useWritingBranches } from '../history/useWritingBranches';
import { marginLayout } from '../sources/marginLayout';
import { useNoteCreation } from '../enrichment/useNoteCreation';
import { useInlineEntities } from '../enrichment/useInlineEntities';
import { EntityProposal } from '../enrichment/EntityProposal';
import { localizeMessage, t, useLocale, localeTag } from '../i18n';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Presence, usePresenceValue } from '../components/Presence';
import { SelectionToolbar, type SelectionAnchor } from '../components/SelectionToolbar';
import { WritingCounter } from '../components/WritingCounter';
import { DepthControl } from '../components/DepthControl';
import { ChevronRight, GitCompareArrows } from 'lucide-react';
import { Palette } from './Palette';
import { request, native } from '../platform/client';
import { Welcome } from './Welcome';
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
import { WorkspaceNotices } from './WorkspaceNotices';
import { useTitleNotices } from './useTitleNotices';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import type { Settings as WritingSettings } from '../contracts/settings';
import type { Source } from '../contracts/sources';
import { countVaultNotes } from '../sources/countNotes';
import { VoiceButton } from '../voice/VoiceButton';
import { Settings } from './Settings';
import { useContextMenu } from '../components/ContextMenu';
import { useScrollActivity } from '../components/useScrollActivity';
import { SidebarDock } from '../components/SidebarDock';
import { useChromeObstructions } from '../components/useChromeObstructions';
const History = lazy(() => import('../history/History').then((m) => ({ default: m.History })));
export function App() {
  const locale = useLocale();
  const openMenu = useContextMenu();
  const workspace = useWorkspace();
  useEffect(() => {
    document.documentElement.lang = locale;
    if (native) void request('appLanguage', { value: locale }).catch(workspace.fail);
  }, [locale, workspace.fail]);
  const scrollActivity = useScrollActivity();
  const memory = useMemory(workspace);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [variantsRequest, setVariantsRequest] = useState(0);
  useEffect(() => {
    if (!workspace.historyMode) setVariantsRequest(0);
  }, [workspace.historyMode]);
  const branches = useWritingBranches({
    path: workspace.p?.path ?? null,
    generation: workspace.doc.generation,
    checkpoint: workspace.doc.checkpoint,
    onChanged: (project) => {
      workspace.activate(project);
      workspace.setHistoryMode(false);
      workspace.setSurface('none');
      setVariantsRequest(0);
    },
    onError: workspace.fail,
  });
  const titleNotices = useTitleNotices(workspace, memory.pending);
  const createNote = useNoteCreation(workspace);
  const inlineEntities = useInlineEntities(
    workspace,
    memory.result,
    memory.entityError,
    memory.entityRevision,
  );
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
  const [sidebarActionsHost, setSidebarActionsHost] = useState<HTMLDivElement | null>(null);
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
  const focusActive =
    !!doc.settings.immersiveFocus &&
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
  if (!ready) return <div className="boot" aria-label={t('Ouverture du projet')} />;
  if (!p || newProject)
    return (
      <>
        <WindowDragRegion onError={workspace.fail} />
        <Welcome beforeOpen={workspace.activity.flush} onOpen={activate} onError={fail} />
        {newProject && (
          <button className="return-project" onClick={() => setNewProject(false)}>
            {t('Revenir au projet')}
          </button>
        )}
        <WorkspaceNotices workspace={workspace} />
      </>
    );
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
      ? p.sections.find((section) => section.id === recallSection)?.title ||
        t('Dans votre manuscrit')
      : memory.suggestion?.kind === 'evidence'
        ? memory.suggestion.evidence.title
        : memory.result?.entities[0]?.title || t('Fiche du manuscrit');
  const railLeft = workspace.marginBounds
    ? Math.max(workspace.marginBounds.right + 32, innerWidth - 215)
    : 0;
  const railWidth = Math.max(0, Math.min(190, innerWidth - railLeft - 25));
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
      p.canUndoStructure
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
                : undefined,
    showDetails:
      (notice.kind === 'error' &&
        (workspace.error.startsWith('EXTERNAL:') || doc.status !== 'error')) ||
      notice.kind === 'recovery' ||
      notice.kind === 'index',
    onDismiss: () => titleNotices.dismiss(notice),
  }));
  return (
    <div
      ref={setAppRoot}
      style={{ '--column-width': (doc.settings.columnWidth ?? 750) + 'px' } as React.CSSProperties}
      data-scrolling={scrollActivity.scrolling}
      data-focus={focusActive}
      data-writing-font={
        (workspace.surface === 'settings' && !workspace.historyMode ? fontPreview : null) ??
        doc.settings.font
      }
      className={
        'app ' +
        (reader || (memory.view && !memory.origin) ? 'with-reader ' : '') +
        (searching ? 'searching-project ' : '') +
        (workspace.historyMode ? 'versions-mode' : '')
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
      <WorkspaceHeader
        libraryBusy={workspace.libraryBusy || historyBusy || branches.busy}
        binder={binder}
        historyMode={workspace.historyMode}
        immersiveFocus={doc.settings.immersiveFocus}
        onToggleFocus={workspace.toggleFocus}
        resumeOpen={memory.view?.kind === 'resume'}
        onResume={() => {
          setMenu(false);
          if (memory.view?.kind === 'resume') memory.close();
          else memory.open({ kind: 'resume' });
        }}
        menu={menu}
        setMenu={setMenu}
        commands={commands}
      />
      <div className="window-title">
        <PathMenu
          project={p}
          selected={selected}
          continuous={doc.settings.continuous}
          onSelect={(id) => void select(id)}
          onAdd={(parent) =>
            void createPage(parent, doc.settings.continuous ? 'manuscript' : selected?.role)
          }
          notifications={pathNotices}
          hasPending={titleNotices.hasPending}
          hasError={titleNotices.hasError}
          noticeDetails={<WorkspaceNotices workspace={workspace} embedded />}
          branchName={(() => {
            const branch = branches.state?.branches.find(
              (item) => item.id === branches.state?.activeBranch,
            );
            return branch ? (branch.isMain ? t('Texte principal') : branch.name) : undefined;
          })()}
          branchMenu={
            branches.state
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
      </div>
      <SidebarDock
        expanded={binder}
        dark={workspace.appearance.dark}
        onToggleTheme={() =>
          workspace.appearance.change(workspace.appearance.dark ? 'light' : 'dark')
        }
        busy={workspace.libraryBusy || historyBusy || branches.busy}
        onActionsHost={setSidebarActionsHost}
      />
      <Presence kind="sidebar">
        {binder && (
          <Binder
            key={p.path}
            historyMode={workspace.historyMode}
            footerTarget={sidebarActionsHost}
            onOperation={workspace.operate}
            onConfigure={doc.configure}
            onReadSource={read}
            onOpenProject={workspace.openProject}
            onError={fail}
            sourceVersion={workspace.sourceVersion}
            busy={workspace.libraryBusy || historyBusy || branches.busy}
            project={p}
            active={active}
            reveal={workspace.revealInBinder}
            onRevealed={() => workspace.setRevealInBinder(0)}
            onSelect={(id) => void select(id)}
            onSurface={(s) => {
              setSurface(s);
              if (s !== 'history' && s !== 'preferences') setBinder(false);
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
            onContinuous={() => void select(active || '', true)}
          />
        )}
      </Presence>
      <main
        inert={workspace.libraryBusy || branches.busy}
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
          historyMode={workspace.historyMode}
          projectName={p.name}
          selected={selected}
          editorRef={editor}
          editorProps={{
            sections: scenes,
            generation: doc.generation,
            readOnly: workspace.libraryBusy || branches.busy,
            settings: doc.settings,
            immersiveFocus: focusActive,
            projectPath: p.path,
            noteLookup: (query) => request('noteSuggestions', { projectPath: p.path, query }),
            noteCreate: createNote,
            noteResolve: (ids) => request('noteReferences', { projectPath: p.path, ids }),
            sourceVersion: workspace.sourceVersion,
            onOpenNote: (id) => {
              void request('source', { id })
                .then((source) => {
                  if (doc.ref.current?.path !== p.path) return;
                  memory.close();
                  inlineEntities.close();
                  workspace.setCard(null);
                  workspace.setReader(source);
                })
                .catch(fail);
            },
            onNoteError: fail,
            entities: inlineEntities.batches,
            searchQuery: searching ? workspace.searchQuery : undefined,
            onEntity: (mention) => {
              memory.close();
              void inlineEntities.open(mention);
            },
            focusPreview: surface === 'settings' && !workspace.historyMode ? focusPreview : null,
            scrollPreview: surface === 'settings' && !workspace.historyMode ? scrollPreview : null,
            onSelection: setTextSelection,
            onSearchSources: (text) => setSearch(text),
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
            if (selected) void update({ ...selected, title }).catch(fail);
          }}
          onChooseTexts={() => {
            setBinder(true);
            workspace.setRevealInBinder((v) => v + 1);
          }}
          onAdd={() => void createPage(active)}
        >
          <EntityProposal entities={inlineEntities} />
        </WritingSurface>
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
      <SelectionToolbar
        anchor={searching || workspace.historyMode ? null : textSelection}
        onFormat={(format) => editor.current?.format(format)}
        onAnnotate={native ? workspace.openAnnotations : undefined}
      />
      {workspace.annotationsOpen && !workspace.historyMode && (
        <Annotations
          key={p.path}
          workspace={workspace}
          left={railVisible ? railLeft : Math.max(12, innerWidth - 290)}
          width={railVisible ? railWidth : 270}
        />
      )}
      {!workspace.annotationsOpen &&
        !workspace.historyMode &&
        (words > 0 || marginPins.sources.length > 0) &&
        railVisible &&
        !(reader || (memory.view && !memory.origin)) && (
          <DocumentaryMargin
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
            source={reader}
            marginPin={marginPinFor(reader)}
            sections={p.sections}
            contentVersion={`${doc.status}:${doc.generation}`}
            onOccurrence={(hit) => void workspace.locateSourceMatch(hit, hit.matched)}
            onCite={(quote) => cite(reader, quote)}
            onClose={() => setReader(null)}
            projectPath={p.path}
            onChange={(source) => {
              if (doc.ref.current?.path === p.path) {
                void workspace.activity.record({
                  kind: 'updated',
                  title: source.title,
                  sourceId: source.id,
                  section: active,
                });
                setReader((current) => (current?.id === source.id ? source : current));
                workspace.refreshEnrichment();
                workspace.setSourceVersion((v) => v + 1);
              }
            }}
            onRead={(id) =>
              void request('source', { id })
                .then((source) => {
                  if (doc.ref.current?.path === p.path) setReader(source);
                })
                .catch(fail)
            }
            onLocate={(section, node, quote) => void workspace.locatePassage(section, node, quote)}
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
            projectPath={p?.path}
            language={doc.settings.language}
            onActivity={memory.setRecording}
            prepareInsertion={() => editor.current?.prepareInsertion() ?? (() => false)}
            panel={panelNode}
            retainContent={panelMode === 'none'}
            open={voiceOpen && !workspace.palette}
            onOpen={() => {
              setPalette(null);
              workspace.setHistoryMode(false);
              if (surface === 'settings') setSurface('none');
              setVoiceOpen(true);
            }}
            onClose={() => setVoiceOpen(false)}
          />
          <WritingCounter
            words={words}
            characters={characters}
            lines={lines}
            notes={countVaultNotes([...workspace.sources, ...marginPins.sources])}
            notesStatus={workspace.sourceStatus}
            hideNotes={focusActive}
            mode={focusActive ? 'words' : doc.settings.countMode}
            onChange={(countMode) => {
              doc.configure({ countMode });
              editor.current?.focus();
            }}
          />
          <Palette
            open={!!workspace.palette}
            sections={workspace.palette === 'sections'}
            textSearch={workspace.palette === 'text'}
            searchScope={p.path}
            initialQuery={workspace.initialSearch}
            onTextSearch={(query) => workspace.setSearchQuery(query)}
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
                    { label: t('Reprendre le fil'), action: () => memory.open({ kind: 'resume' }) },
                    {
                      label: t('Fiches du manuscrit'),
                      action: () => memory.open({ kind: 'list' }),
                    },
                  ].filter((command) => command.id !== 'sources')
            }
          />
          {searching && (
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
        {!!selected?.goal && (
          <div className="goal-status">
            <span className="goal-track">
              <i style={{ width: Math.min(100, (words / selected.goal) * 100) + '%' }} />
            </span>
            <span>{selected.goal.toLocaleString(localeTag())}</span>
          </div>
        )}
        <DepthControl value={doc.settings.depth} onChange={(depth) => doc.configure({ depth })} />
        <div className="settings-control" data-open={surface === 'settings'}>
          <button
            ref={settingsTrigger}
            className="settings-trigger"
            aria-label={workspace.historyMode ? t('Outils des versions') : t('Réglages d’écriture')}
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
            {workspace.historyMode ? <GitCompareArrows size={16} aria-hidden="true" /> : 'Aa'}
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
        </div>
      </footer>
      <WorkspaceDialogs
        onNotice={titleNotices.notify}
        onLoading={titleNotices.setDialogLoading}
        workspace={workspace}
        onMemory={() => memory.open({ kind: 'list' })}
      />
    </div>
  );
}
