import { useGoalProgress } from '../project/useGoalProgress';
import { WritingLandmarks } from './writing/WritingLandmarks';
import { WorkspaceMargin } from './writing/WorkspaceMargin';
import { useSelectionReading } from './writing/useSelectionReading';
import { WorkspaceSidebar } from './chrome/WorkspaceSidebar';
import { WorkspaceTitle, workspaceTitleView } from './chrome/WorkspaceTitle';
import { WritingFooter } from './chrome/WritingFooter';
import { useWritingControls } from './chrome/useWritingControls';
import { WorkspacePalette } from './WorkspacePalette';
import { ManuscriptEditor } from './writing/ManuscriptEditor';
import { FilteredManuscript, ManuscriptLineDetails } from './writing/ManuscriptTagViews';
import { useDocumentaryRail } from '../sources/margin/useDocumentaryRail';
import { useWorkspacePages } from './workspace/useWorkspacePages';
import { WorkspaceInbox } from './workspace/WorkspaceInbox';
import { useManuscriptFilters } from './writing/useManuscriptFilters';
import { nativeBindings } from './commands/shortcuts';
import { useEntityManager } from '../entities/useEntityManager';
import { EntityManager } from '../entities/EntityManager';
import { WindowDragRegion } from '../components/WindowDragRegion';
import { useNoteObservations } from '../notes/useNoteObservations';
import { WorkspaceHeader } from './chrome/WorkspaceHeader';
import { HistoryEdge } from './chrome/HistoryEdge';
import { useWritingBranches } from '../history/useWritingBranches';
import { useNoteCreation } from '../enrichment/useNoteCreation';
import { useInlineEntities } from '../enrichment/useInlineEntities';
import { EntityProposal } from '../enrichment/EntityProposal';
import { t, useLocale } from '../i18n';
import { useCallback, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SelectionToolbar, type SelectionAnchor } from '../components/SelectionToolbar';
import { ChevronRight } from 'lucide-react';
import { request, native } from '../platform/client';
import { Welcome } from './Welcome';
import { modelNotifications } from './modelNotifications';
import { RuntimeModelsProvider, useRuntimeModels } from './runtimeModels';
import { Annotations } from '../project/AnnotationMargin';
import { WorkspaceSourcePanels } from './writing/WorkspaceSourcePanels';
import { trackSidebarPointer } from '../project/sidebarPointer';
import { FloatingVaultResults } from '../sources/FloatingVaultResults';
import { useWorkspace } from './useWorkspace';
import { useMemory } from '../enrichment/useMemory';
import { MemoryReader } from '../enrichment/MemoryReader';
import { ViewTitleCapsuleProvider, type TitleView } from '../components/ViewTitleCapsule';
import { WorkspaceNotices } from './WorkspaceNotices';
import { useTitleNotices } from './useTitleNotices';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import { WorkspaceScreenHost } from '../components/WorkspaceScreen';
import { countVaultNotes } from '../sources/countNotes';
import type { AnnotationRecorder } from '../voice/types';
import { useScrollActivity } from '../components/useScrollActivity';
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
  const recorder = useRef<AnnotationRecorder | null>(null);
  const finishDictation = useCallback(async () => {
    await recorder.current?.finish();
  }, []);
  const workspace = useWorkspace(finishDictation);
  const pages = useWorkspacePages({
    project: workspace.p,
    newProject: workspace.newProject,
    surface: workspace.surface,
    historyMode: workspace.historyMode,
    editor: workspace.editor,
    setBinder: workspace.setBinder,
    setSurface: workspace.setSurface,
    close: workspace.close,
    select: workspace.select,
    fail: workspace.fail,
  });
  const { pageActive, pageBusy, inboxOpen } = pages;
  const manager = useEntityManager(
    workspace.p?.path,
    workspace.sourceVersion + workspace.doc.generation,
  );
  const memory = useMemory(workspace, catalog.status?.installed.includes('memory') ?? false);
  const inlineEntities = useInlineEntities(
    workspace,
    memory.result,
    memory.entityError,
    memory.entityRevision,
  );
  const closeEntityPanels = () => {
    memory.close();
    inlineEntities.close();
  };
  const goalProgress = useGoalProgress(workspace.doc);
  const filters = useManuscriptFilters({
    project: workspace.p,
    active: workspace.active,
    historyMode: workspace.historyMode,
    palette: workspace.palette,
    editor: workspace.editor,
    reader: workspace.reader,
    memoryView: memory.view,
    annotationsOpen: workspace.annotationsOpen,
    manager,
    batches: inlineEntities.batches,
    removeAssignment: workspace.doc.removeTagAssignment,
    stageSettings: workspace.doc.stageSettings,
    enterTagFilter: () => {
      workspace.setSurface('none');
      workspace.setHistoryMode(false);
      workspace.setPalette(null);
      workspace.setReader(null);
      workspace.setCard(null);
      closeEntityPanels();
    },
  });
  const { filteredTag, lineDetailVisible, filterCounts } = filters;
  useEffect(() => {
    document.documentElement.lang = locale;
    if (native)
      void request('appLanguage', { value: locale })
        .then(() => request('appShortcuts', { bindings: nativeBindings() }))
        .catch(workspace.fail);
  }, [locale, workspace.fail]);
  const scrollActivity = useScrollActivity();
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
  const speech = useSelectionReading(
    workspace.editor,
    workspace.doc.settings.language,
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
  const controls = useWritingControls(workspace.surface, workspace.palette, workspace.setSurface);
  const [appRoot, setAppRoot] = useState<HTMLDivElement | null>(null);
  useChromeObstructions(appRoot, workspace.binder, workspace.historyMode);
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
    card,
    setCard,
    reader,
    setReader,
    searching,
    setSearch,
    ready,
    createPage,
    menu,
    setMenu,
    newProject,
    setNewProject,
    editor,
    activate,
    p,
    active,
    selected,
    scenes,
    select,
    commands,
    cite,
    read,
    update,
  } = workspace;
  const previewSettings = surface === 'settings' && !workspace.historyMode;
  const chromeBusy = workspace.libraryBusy || historyBusy || branches.busy || pageBusy;
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
  const rail = useDocumentaryRail({
    project: p,
    active,
    pinSection,
    continuous: doc.settings.continuous,
    activity: workspace.activity,
    bounds: workspace.marginBounds,
    groups: workspace.groups,
    card,
    groupOpen: workspace.groupOpen,
    setGroupOpen: workspace.setGroupOpen,
    memory,
    annotationsOpen: workspace.annotationsOpen,
  });
  const { marginPins, railVisible } = rail;
  const { railLeft, railWidth } = rail.layout;
  const renderCapsule = (view?: TitleView) => (
    <WorkspaceTitle
      project={p ?? undefined}
      view={view}
      selected={selected}
      continuous={doc.settings.continuous}
      onSelect={pages.selectFromChrome}
      onAdd={(parent) => {
        if (!pageBusy)
          void createPage(parent, doc.settings.continuous ? 'manuscript' : selected?.role);
      }}
      notifications={[
        ...titleNotices.pathNotices.filter((notice) => notice.tone === 'error'),
        ...modelNotifications(catalog, locale),
        ...titleNotices.pathNotices.filter((notice) => notice.tone !== 'error'),
      ]}
      hasPending={titleNotices.hasPending}
      hasError={titleNotices.hasError}
      noticeDetails={<WorkspaceNotices workspace={workspace} embedded />}
      branches={branches}
      busy={workspace.libraryBusy || historyBusy}
      onManage={() => {
        setVariantsRequest((v) => v + 1);
        setSurface('history');
      }}
    />
  );
  const currentView = workspaceTitleView(pages, filters, workspace.historyMode, () => {
    workspace.setHistoryMode(false);
    setSurface('none');
  });
  const inbox = inboxOpen ? (
    <WorkspaceInbox
      project={p}
      branches={branches.state}
      onBranch={branches.switchBranch}
      selectedId={pages.inboxSelection}
      onSelection={pages.setInboxSelection}
      onClose={() => pages.setInboxOpen(false)}
      onError={fail}
      onNotice={(message) => workspace.setLibraryNotice({ message, undo: false })}
      onOpenProject={workspace.openProject}
      onCreate={() => {
        pages.resumeAfterCreation();
        setNewProject(true);
      }}
      doc={doc}
      flushActivity={workspace.activity.flush}
      activate={activate}
    />
  ) : null;
  if (!ready)
    return (
      <div className="boot" aria-label={t('Ouverture du projet')}>
        <WindowDragRegion onError={fail} />
        <div className="window-title">
          {renderCapsule({ title: t('Ouverture du projet'), home: true })}
        </div>
      </div>
    );
  if (!p || newProject)
    return (
      <ViewTitleCapsuleProvider value={renderCapsule}>
        <WindowDragRegion onError={workspace.fail} />
        <Welcome beforeOpen={workspace.activity.flush} onOpen={activate} onError={fail} />
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
          (workspace.surface === 'settings' && !workspace.historyMode
            ? controls.fontPreview
            : null) ?? doc.settings.font
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
          libraryBusy={chromeBusy}
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
        <WorkspaceSidebar
          project={p}
          active={active}
          historyMode={workspace.historyMode}
          busy={chromeBusy}
          binder={binder}
          setBinder={setBinder}
          appearance={workspace.appearance}
          pages={pages}
          setSurface={setSurface}
          doc={doc}
          read={read}
          select={select}
          fail={fail}
          update={update}
          onOperation={workspace.operate}
          onOpenProject={workspace.openProject}
          sourceVersion={workspace.sourceVersion}
          reveal={workspace.revealInBinder}
          onRevealed={() => workspace.setRevealInBinder(0)}
          onAdd={workspace.startCreation}
          creation={workspace.newSection}
          creationTitle={workspace.newTitle}
          onCreationTitle={workspace.setNewTitle}
          onConfirmCreation={workspace.add}
          onCancelCreation={() => {
            workspace.setNewSection(null);
            workspace.setNewTitle('');
          }}
          onMove={(...args) => void workspace.move(...args)}
        />
        <main
          hidden={pageActive}
          inert={pageActive || workspace.libraryBusy || branches.busy}
          aria-busy={workspace.libraryBusy || historyBusy || branches.busy}
          className={
            'writing-layout' +
            (((previewSettings ? controls.scrollPreview : null) ?? doc.settings.typewriter)
              ? ' typewriter'
              : '') +
            (binder ? ' sidebar-open' : '') +
            (workspace.historyMode ? ' history-layout' : '')
          }
        >
          <ManuscriptEditor
            project={p}
            selected={selected}
            doc={doc}
            editor={editor}
            hidden={workspace.historyMode || !!filteredTag}
            filters={filters}
            scrollActivity={scrollActivity}
            input={{
              sections: scenes,
              readOnly:
                pageActive ||
                workspace.historyMode ||
                workspace.libraryBusy ||
                branches.busy ||
                !!filteredTag,
              immersiveFocus: focusActive,
              noteCreate: createNote,
              entities: inlineEntities.batches,
              sourceVersion: workspace.sourceVersion,
              searchQuery: searching ? workspace.searchQuery : undefined,
              focusPreview: previewSettings ? controls.focusPreview : null,
              scrollPreview: previewSettings ? controls.scrollPreview : null,
              writingBranch: p.activeBranch ?? branches.state?.activeBranch ?? 'main',
              lineHeightPreview: previewSettings ? controls.lineHeightPreview : null,
              onWritingEdit: workspace.recordWritingEdit,
              onVisible: workspace.onVisible,
              onCursor: (v) => {
                workspace.cursor.current = v;
              },
              onSearchSources: setSearch,
              onOpenNote: (id) => void read(id, closeEntityPanels),
              onEntity: (mention) => {
                memory.close();
                void inlineEntities.open(mention);
              },
              onTyping: () => {
                memory.onTyping();
                inlineEntities.close();
                workspace.serial.current++;
                setCard(null);
              },
              onSelection: setTextSelection,
              onWords: workspace.setWords,
              onCharacters: setCharacters,
              onLines: setLines,
            }}
            onOutlineDetails={(section, node) => {
              closeEntityPanels();
              setCard(null);
              setReader(null);
              workspace.setAnnotationsOpen(false);
              setBinder(false);
              filters.setLineDetail({ project: p.path, section, node });
            }}
            fail={fail}
            update={update}
            onChooseTexts={() => {
              setBinder(true);
              workspace.setRevealInBinder((v) => v + 1);
            }}
            onAdd={() => void createPage(active)}
          >
            <EntityProposal entities={inlineEntities} />
          </ManuscriptEditor>
          <FilteredManuscript
            project={p}
            filters={filters}
            batches={inlineEntities.batches}
            locatePassage={workspace.locatePassage}
            read={read}
            fail={fail}
            projectRef={doc.ref}
          />
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
                toolsHost={controls.versionToolsHost}
                toolsOpen={surface === 'settings'}
                onCloseTools={() => {
                  setSurface('none');
                  controls.settingsTrigger.current?.focus();
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
          ref={pages.setPageHost}
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
            {...speech.toolbar}
            onTry={() => editor.current?.writingAid('trial-start')}
          />
          <ManuscriptLineDetails
            project={p}
            filters={filters}
            batches={inlineEntities.batches}
            locatePassage={workspace.locatePassage}
            read={read}
            fail={fail}
            editor={editor}
            onManage={() => setSurface('tags')}
          />
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
          <WritingLandmarks
            key={p.path}
            workspace={workspace}
            branches={branches}
            visible={
              !pageActive &&
              !workspace.historyMode &&
              !filteredTag &&
              !lineDetailVisible &&
              !reader &&
              !focusActive &&
              !workspace.annotationsOpen
            }
            clearViews={() => {
              closeEntityPanels();
              filters.setTagFilter(null);
              filters.setQueryFilter(null);
              workspace.setReader(null);
              workspace.setAnnotationsOpen(false);
              workspace.setSurface('none');
              workspace.setSearch(null);
            }}
          />
          <WorkspaceMargin
            rail={rail}
            settings={doc.settings}
            hidden={workspace.historyMode || !!filteredTag || !!lineDetailVisible}
            annotationsOpen={workspace.annotationsOpen}
            reader={reader}
            words={words}
            memory={memory}
            editor={editor}
            fail={fail}
            read={read}
            cite={cite}
            card={card}
            setCard={setCard}
            setSurface={setSurface}
          />
          <MemoryReader
            memory={memory}
            workspace={workspace}
            projectMenuOpen={menu}
            writingMenuOpen={surface === 'settings'}
          />
          <WorkspaceSourcePanels
            project={p}
            doc={doc}
            active={active}
            branchId={branches.state?.activeBranch}
            branchBusy={branches.busy}
            card={card}
            setCard={setCard}
            reader={reader}
            setReader={setReader}
            read={read}
            cite={cite}
            fail={fail}
            marginPinFor={rail.marginPinFor}
            locateSourceMatch={workspace.locateSourceMatch}
            registerCitation={workspace.registerCitation}
            locatePassage={workspace.locatePassage}
            linkDocument={workspace.linkDocument}
            beginReaderRequest={workspace.beginReaderRequest}
            recordDocumentPosition={workspace.recordDocumentPosition}
            record={workspace.activity.record}
            onAssociated={() => {
              rail.refreshAssociations();
              setSurface('prepare');
            }}
            onSourceChanged={() => {
              workspace.refreshEnrichment();
              workspace.setSourceVersion((v) => v + 1);
            }}
            onRevealAnnotations={(clearTarget) => {
              if (clearTarget) workspace.setAnnotationTarget(null);
              workspace.setAnnotationsOpen(true);
            }}
          />{' '}
          <WritingFooter
            controls={controls}
            filters={filters}
            doc={doc}
            editor={editor}
            projectPath={p.path}
            busy={historyBusy || branches.busy}
            historyMode={workspace.historyMode}
            hasScenes={scenes.length > 0}
            paletteOpen={!!workspace.palette}
            focusActive={focusActive}
            surface={surface}
            setSurface={setSurface}
            onToggleSettings={() => {
              setPalette(null);
              controls.setVoiceOpen(false);
              setCard(null);
              if (memory.origin) memory.close();
              setSurface(surface === 'settings' ? 'none' : 'settings');
            }}
            goal={selected?.goal}
            words={words}
            counts={{
              goals: goalProgress,
              words: filteredTag ? filterCounts.words : words,
              characters: filteredTag ? filterCounts.characters : characters,
              lines: filteredTag ? filterCounts.lines : lines,
              notes: countVaultNotes([...workspace.sources, ...marginPins.sources]),
              notesStatus: workspace.sourceStatus,
            }}
            voice={{
              ref: recorder,
              beforeRecording: speech.stop,
              needsInstall: !!catalog.status && !catalog.status.installed.includes('voice'),
              onInstall: () => catalog.offer({ key: 'voice', id: 'voice' }),
              onActivity: memory.setRecording,
              onOpen: () => {
                filters.setTagFilter(null);
                setPalette(null);
                workspace.setHistoryMode(false);
                if (surface === 'settings') setSurface('none');
                controls.setVoiceOpen(true);
              },
            }}
          >
            <WorkspacePalette
              mode={workspace.palette}
              project={p}
              manager={manager}
              query={workspace.searchQuery}
              initialQuery={workspace.initialSearch}
              onTextSearch={workspace.setSearchQuery}
              onQuery={setSearch}
              panel={controls.panelNode}
              retainContent={controls.panelMode === 'none'}
              editor={editor}
              commands={commands}
              select={select}
              canSplit={!pageActive && !filteredTag}
              historyMode={workspace.historyMode}
              captureSplitPreview={workspace.captureSplitPreview}
              splitPreview={workspace.splitPreview}
              confirmSplitPreview={workspace.confirmSplitPreview}
              onOpenQuery={(query, name) => {
                setSearch(null);
                filters.setTagFilter(null);
                filters.setQueryFilter({ path: p.path, query, name });
                setSurface('none');
                setReader(null);
                setCard(null);
                closeEntityPanels();
              }}
              onMemory={memory.open}
              onOpen={() => {
                controls.setVoiceOpen(false);
                if (surface === 'settings') setSurface('none');
                setSearch('');
              }}
              onClose={() => {
                setSearch(null);
                setCard(null);
                editor.current?.focus();
              }}
            />
            {searching && !/^[#@]/.test(workspace.searchQuery.trim()) && (
              <FloatingVaultResults
                query={workspace.searchQuery}
                sources={workspace.vaultSearch.sources}
                busy={workspace.vaultSearch.busy}
                error={workspace.vaultSearch.error || marginPins.error}
                colors={doc.settings.entityColors}
                pinned={rail.pinIds}
                pinning={marginPins.busy}
                canPin={!!pinSection}
                onOpen={(source) => void read(source)}
                onPin={rail.pinSource}
              />
            )}
          </WritingFooter>
        </div>
        <WorkspaceScreenHost value={pages.pageHostContext}>
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
            onTagFilter={filters.openTagFilter}
            onCloseManuscriptFilter={filters.closeTagFilter}
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
