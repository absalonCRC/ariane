import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Presence, usePresenceValue } from '../components/Presence';
import { panelOrigin } from '../components/useSharedPanel';
import { SelectionToolbar, type SelectionAnchor } from '../components/SelectionToolbar';
import { WritingCounter } from '../components/WritingCounter';
import { DepthControl } from '../components/DepthControl';
import { ChevronRight, MoreHorizontal, Pause, Copy, ArrowUpRight } from 'lucide-react';
import { Palette } from './Palette';
import { request } from './client';
import { Welcome } from './Welcome';
import { Binder } from '../project/Binder';
import { Editor } from '../editor/Editor';
import { SourceCard } from '../sources/SourceCard';
import { Reader } from '../sources/Reader';
import { SourceSearch } from '../sources/Search';
import { DocumentTitle } from '../components/DocumentTitle';
import { ordered } from '../project/tree';
import { PathMenu } from '../project/PathMenu';
import { useWorkspace } from './useWorkspace';
import { useMemory } from '../enrichment/useMemory';
import { MemoryReader } from '../enrichment/MemoryReader';
import { WorkspaceNotices } from './WorkspaceNotices';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import type { Source } from './types';
import { countVaultNotes } from '../sources/countNotes';
import { VoiceButton } from '../voice/VoiceButton';
import { Settings } from './Settings';
import { useContextMenu } from '../components/ContextMenu';
import { sourceContext } from '../sources/contextMenu';
import { ArianeWordmark } from '../components/ArianeWordmark';
export function App() {
  const openMenu = useContextMenu();
  const workspace = useWorkspace();
  const memory = useMemory(workspace);
  useEffect(() => {
    if (import.meta.env.VITE_PERFORMANCE === '1')
      void import('../performance/native').then(({ attach }) => attach(workspace, memory));
  });
  const [textSelection, setTextSelection] = useState<SelectionAnchor | null>(null);
  const [lines, setLines] = useState(1);
  const [characters, setCharacters] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [associated, setAssociated] = useState<Set<string>>(new Set());
  const [associationVersion, setAssociationVersion] = useState(0);
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const panelMode = workspace.palette ? 'search' : voiceOpen ? 'voice' : 'none';
  const previousPanel = useRef<typeof panelMode>('none');
  const lastPanel = useRef<'search' | 'voice'>('search');
  const [morphPanel, setMorphPanel] = useState(false);
  useLayoutEffect(() => {
    const controls = panelNode?.parentElement;
    if (!panelNode || !controls) return;
    const searchButton = controls.querySelector<HTMLElement>('.header-search');
    const voiceButton = controls.querySelector<HTMLElement>('.voice-control');
    if (!searchButton || !voiceButton) return;
    const measure = () => {
      const width = panelNode.offsetWidth;
      if (!width) return;
      const left = panelNode.offsetLeft - width / 2;
      const scale = Math.min(1, 32 / width);
      controls.dataset.voiceEdge = String(voiceButton.offsetLeft - left < 14);
      controls.dataset.searchEdge = String(
        left + width - (searchButton.offsetLeft + searchButton.offsetWidth) < 14,
      );
      const origin = (button: HTMLElement) => {
        const center = button.offsetLeft + button.offsetWidth / 2 - left;
        return scale < 1 ? (center - (width * scale) / 2) / (1 - scale) : width / 2;
      };
      panelNode.style.setProperty('--search-origin', `${origin(searchButton)}px`);
      panelNode.style.setProperty('--voice-origin', `${origin(voiceButton)}px`);
      panelNode.style.setProperty('--collapsed-scale', String(scale));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(controls);
    observer?.observe(panelNode);
    return () => observer?.disconnect();
  }, [panelNode]);
  useLayoutEffect(() => {
    if (previousPanel.current !== panelMode) {
      const switching = previousPanel.current !== 'none' && panelMode !== 'none';
      setMorphPanel(switching);
      if (panelMode !== 'none') lastPanel.current = panelMode;
      previousPanel.current = panelMode;
      if (switching) {
        const timer = window.setTimeout(() => setMorphPanel(false), 340);
        return () => window.clearTimeout(timer);
      }
    }
  }, [panelMode]);
  useEffect(() => {
    if (workspace.palette) {
      setVoiceOpen(false);
      if (workspace.surface === 'settings') workspace.setSurface('none');
    }
  }, [workspace.palette]);
  useEffect(() => {
    if (!workspace.palette || workspace.palette === 'sections')
      workspace.editor.current?.clearTextSearch();
  }, [workspace.palette]);
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
    search,
    setSearch,
    progress,
    groupOpen,
    setGroupOpen,
    ready,
    setNewSection,
    createPage,
    focusTitleId,
    setFocusTitleId,
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
  const sourcePresence = usePresenceValue(groups.length ? groups : null);
  useEffect(() => {
    let alive = true;
    setAssociated(new Set());
    if (p && active && !doc.settings.continuous) {
      void request<Source[]>('links', { section: active })
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
  if (!ready) return <div className="boot" aria-label="Ouverture du projet" />;
  if (!p || newProject)
    return (
      <>
        <Welcome onOpen={activate} onError={fail} />
        {newProject && (
          <button className="return-project" onClick={() => setNewProject(false)}>
            Revenir au projet
          </button>
        )}
        <WorkspaceNotices workspace={workspace} />
      </>
    );
  const contextTop =
    memory.top === null
      ? null
      : Math.max(memory.top, ...groups.map((g) => g.top + Math.min(g.sources.length, 2) * 54 + 36));
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
      ? p.sections.find((section) => section.id === recallSection)?.title || 'Dans votre manuscrit'
      : memory.suggestion?.kind === 'evidence'
        ? memory.suggestion.evidence.title
        : memory.result?.entities[0]?.title || 'Fiche du manuscrit';
  const railLeft = workspace.marginBounds
    ? Math.max(workspace.marginBounds.right + 32, innerWidth - 215)
    : 0;
  const railWidth = Math.max(0, Math.min(190, innerWidth - railLeft - 25));
  const railVisible = !!workspace.marginBounds && railWidth >= 150;
  const contextVisible =
    railVisible &&
    contextTop !== null &&
    contextTop + (suggestionExcerpt ? 125 : 80) < (workspace.marginBounds?.bottom ?? 0);
  return (
    <div
      className={
        'app ' +
        (doc.settings.font === 'mono' ? 'mono ' : '') +
        (reader || (memory.view && !memory.origin) ? 'with-reader' : '')
      }
    >
      {!binder && (
        <button
          className="edge-trigger"
          aria-label="Déplier la sidebar"
          title="Ouvrir la sidebar"
          aria-controls="project-sidebar"
          aria-expanded={false}
          onClick={() => setBinder(true)}
        >
          <ChevronRight size={17} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <header className="app-header">
        <ArianeWordmark />
        <div className="header-right">
          <div className="menu-control" data-open={menu}>
            <button
              className="icon-button menu-trigger"
              aria-label="Menu du projet"
              aria-expanded={menu}
              aria-controls="project-menu"
              onClick={() => setMenu((v) => !v)}
            >
              <MoreHorizontal size={19} />
            </button>
            <nav
              id="project-menu"
              className="project-menu floating"
              aria-label="Menu du projet"
              aria-hidden={!menu}
              inert={!menu}
            >
              {commands
                .filter((c) =>
                  [
                    'Exporter le manuscrit',
                    'Sources du projet',
                    'Créer une variante / Voir les versions',
                    'Créer un projet',
                    'Ouvrir un projet',
                  ].includes(c.label),
                )
                .map((c) => (
                  <button
                    key={c.label}
                    onClick={() => {
                      setMenu(false);
                      c.action();
                    }}
                  >
                    {c.label}
                  </button>
                ))}
            </nav>
          </div>
        </div>
      </header>
      <div className="window-title">
        <PathMenu
          project={p}
          selected={selected}
          continuous={doc.settings.continuous}
          onSelect={(id) => void select(id)}
          onAdd={(parent) => void createPage(parent)}
        />
      </div>
      <Presence kind="sidebar">
        {binder && (
          <Binder
            project={p}
            active={active}
            onSelect={(id) => void select(id)}
            onSurface={(s) => {
              setSurface(s);
              setBinder(false);
            }}
            onClose={() => setBinder(false)}
            onAdd={(parent, kind) => kind === 'scene' ? void createPage(parent) : setNewSection({ parent, kind })}
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
        className={
          'writing-layout' +
          (doc.settings.typewriter ? ' typewriter' : '') +
          (binder ? ' sidebar-open' : '')
        }
      >
        <div
          className="manuscript-column"
          style={
            { '--typewriter-line-half': `${doc.settings.fontSize * 0.75}px` } as React.CSSProperties
          }
        >
          <DocumentTitle
            key={doc.settings.continuous ? p.path : selected?.id}
            title={doc.settings.continuous ? p.name : selected?.title || ''}
            readOnly={doc.settings.continuous}
            autoFocus={!!selected && !doc.settings.continuous && focusTitleId === selected.id}
            onAutoFocus={() => setFocusTitleId(null)}
            onEnter={() => editor.current?.focus()}
            onCommit={(title) => {
              if (selected) void update({ ...selected, title }).catch(fail);
            }}
          />
          <Editor
            ref={editor}
            sections={scenes}
            generation={doc.generation}
            settings={doc.settings}
            onSelection={setTextSelection}
            onSearchSources={(text) => setSearch(text)}
            onChange={doc.edit}
            onDraftChange={doc.editDraft}
            onVisible={onVisible}
            onWords={setWords}
            onCharacters={setCharacters}
            onLines={setLines}
            onCursor={(v) => (cursor.current = v)}
            onTyping={() => {
              memory.onTyping();
              serial.current++;
              setCard(null);
              workspace.setSourceStatus('loading');
              workspace.setSources((current) => (current.length ? [] : current));
            }}
          />
          {!scenes.length && (
            <button
              className="add-first-scene"
              onClick={() => void createPage(active)}
            >
              Ajouter une scène à cette section
            </button>
          )}
        </div>
      </main>
      <SelectionToolbar
        anchor={textSelection}
        onFormat={(format) => editor.current?.format(format)}
      />
      {words > 0 &&
        railVisible &&
        !(reader || (memory.view && !memory.origin) || search !== null) && (
          <div
            className="source-margin"
            aria-label="Sources dans la marge"
            data-phase={sourcePresence.exiting ? 'exit' : 'open'}
            inert={sourcePresence.exiting}
            aria-hidden={sourcePresence.exiting || undefined}
            style={
              workspace.marginBounds
                ? {
                    left: railLeft,
                    width: railWidth,
                    clipPath: `inset(${Math.max(0, workspace.marginBounds.top)}px 0 ${Math.max(0, innerHeight - workspace.marginBounds.bottom)}px 0)`,
                  }
                : { visibility: 'hidden' }
            }
          >
            {(sourcePresence.value ?? []).map((g) => (
              <div
                className="source-group"
                data-anchor-line={g.id}
                data-expanded={groupOpen === g.id}
                key={g.id}
                style={{ top: g.top }}
              >
                {g.sources.slice(0, groupOpen === g.id ? g.sources.length : 2).map((s) => (
                  <button
                    className="source-label"
                    key={s.id}
                    onContextMenu={(event) =>
                      openMenu(
                        event,
                        sourceContext(s, {
                          onRead: () => read(s),
                          onCite: (quote) => cite(s, quote),
                        }),
                      )
                    }
                    data-expanded={card?.source.id === s.id}
                    onClick={(event) => {
                      setSurface('none');
                      setCard({
                        source: s,
                        top: g.top,
                        origin: panelOrigin(event.currentTarget, s.title),
                      });
                    }}
                  >
                    <span>{s.title}</span>
                    <small>
                      {s.kind} ·{' '}
                      {associated.has(s.id)
                        ? 'associée à cette section'
                        : s.score === 100
                          ? 'mention détectée'
                          : s.score === 80 || s.score === 40
                            ? 'lien entre sources'
                            : 'suggestion'}
                    </small>
                  </button>
                ))}
                {g.sources.length > 2 && (
                  <button
                    className="more-sources"
                    aria-expanded={groupOpen === g.id}
                    aria-label={
                      groupOpen === g.id
                        ? 'Réduire les sources'
                        : `Afficher les ${g.sources.length - 2} autres sources`
                    }
                    onClick={() => setGroupOpen(groupOpen === g.id ? null : g.id)}
                  >
                    {groupOpen === g.id ? 'Réduire' : '+' + (g.sources.length - 2)}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      <Presence kind="content">
        {memory.showResume && !memory.view && !reader && (
          <button className="memory-resume" onClick={() => memory.open({ kind: 'resume' })}>
            Reprendre le fil
          </button>
        )}
      </Presence>
      <Presence kind="anchored">
        {memory.suggestion &&
          contextVisible &&
          doc.settings.focus === 'none' &&
          !memory.view &&
          !reader &&
          !card &&
          search === null && (
            <button
              onContextMenu={(event) => {
                const suggestion = memory.suggestion!;
                openMenu(event, {
                  title: suggestion.kind === 'entity' ? 'Fiche du manuscrit' : 'Passage suggéré',
                  groups: [
                    [
                      {
                        label: suggestion.kind === 'entity' ? 'Ouvrir la fiche' : 'Voir le passage',
                        icon: ArrowUpRight,
                        run: () => {
                          setSurface('none');
                          memory.open(suggestion);
                        },
                      },
                      ...(suggestionExcerpt && typeof navigator.clipboard?.writeText === 'function'
                        ? [
                            {
                              label: 'Copier l’extrait',
                              icon: Copy,
                              run: () => navigator.clipboard.writeText(suggestionExcerpt),
                            },
                          ]
                        : []),
                    ],
                  ],
                });
              }}
              className="source-label memory-context"
              style={{ top: contextTop!, left: railLeft, width: railWidth }}
              onClick={(event) => {
                setSurface('none');
                memory.open(memory.suggestion!, panelOrigin(event.currentTarget, suggestionTitle));
              }}
            >
              <span>{suggestionTitle}</span>
              <small>
                {memory.suggestion.kind === 'entity'
                  ? 'Depuis votre texte'
                  : memory.suggestion.kind === 'evidence'
                    ? 'Passage à confronter'
                    : 'Dans votre manuscrit'}
              </small>
              {suggestionExcerpt && (
                <span className="suggestion-excerpt">
                  {suggestionExcerpt.replace(/\s+/g, ' ').trim()}
                </span>
              )}
            </button>
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
            citationStyle={doc.settings.citationStyle}
            onRegister={(s, t) => workspace.registerCitation(s, t).catch(fail)}
            top={card.top}
            onClose={() => setCard(null)}
            onRead={() => void read(card.source)}
            onAssociate={() =>
              void request('associate', {
                section: active,
                id: card.source.id,
                payload: card.source,
              })
                .then(() => {
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
            onCite={(quote) => cite(reader, quote)}
            onClose={() => setReader(null)}
            projectPath={p.path}
            onChange={(source) => {
              if (doc.ref.current?.path === p.path) {
                setReader((current) => (current?.id === source.id ? source : current));
                workspace.refreshEnrichment();
              }
            }}
            onRead={(id) =>
              void request<Source>('source', { id })
                .then((source) => {
                  if (doc.ref.current?.path === p.path) setReader(source);
                })
                .catch(fail)
            }
            onLocate={(section, node, quote) => void workspace.locatePassage(section, node, quote)}
          />
        )}
      </Presence>{' '}
      <Presence>
        {search !== null && (
          <SourceSearch
            initial={search}
            onClose={() => setSearch(null)}
            onSelect={(s) => void read(s)}
          />
        )}
      </Presence>
      <footer className="statusbar">
        <div className="save-state" role="status">
          <Presence kind="content">
            {doc.status !== 'saved' && (
              <span className="state-label" key={doc.status}>
                {doc.status === 'saving'
                  ? 'Enregistrement…'
                  : doc.status === 'error'
                    ? 'Modifications non enregistrées'
                    : 'Modifications en cours'}
              </span>
            )}
          </Presence>
        </div>
        <div
          className="bottom-controls"
          data-panel={panelMode}
          data-anchor={panelMode === 'none' ? lastPanel.current : panelMode}
          data-morph={morphPanel}
        >
          <div className="bottom-connector" aria-hidden="true" />
          <VoiceButton
            language={doc.settings.language}
            onActivity={memory.setRecording}
            prepareInsertion={() => editor.current?.prepareInsertion() ?? (() => false)}
            panel={panelNode}
            retainContent={panelMode === 'none'}
            open={voiceOpen && !workspace.palette}
            onOpen={() => {
              setPalette(null);
              if (surface === 'settings') setSurface('none');
              setVoiceOpen(true);
            }}
            onClose={() => setVoiceOpen(false)}
          />
          <WritingCounter
            words={words}
            characters={characters}
            lines={lines}
            notes={countVaultNotes(workspace.sources)}
            notesStatus={workspace.sourceStatus}
            mode={doc.settings.countMode}
            onChange={(countMode) => {
              doc.configure({ countMode });
              editor.current?.focus();
            }}
          />
          <Palette
            open={!!workspace.palette}
            sections={workspace.palette === 'sections'}
            textSearch={workspace.palette === 'text'}
            searchScope={doc.generation + ':' + scenes.map((scene) => scene.id).join(':')}
            onTextSearch={(query) => editor.current?.findText(query)}
            onNextMatch={(query, backwards) =>
              editor.current?.findText(query, backwards ? 'previous' : 'next')
            }
            panel={panelNode}
            retainContent={panelMode === 'none'}
            onOpen={() => {
              setVoiceOpen(false);
              if (surface === 'settings') setSurface('none');
              setPalette('text');
            }}
            onClose={() => {
              setPalette(null);
              editor.current?.focus();
            }}
            commands={
              workspace.palette === 'sections'
                ? ordered(p.sections).map((section) => ({
                    label: section.title || 'Sans titre',
                    detail:
                      section.kind === 'scene'
                        ? 'Scène'
                        : section.kind === 'chapter'
                          ? 'Chapitre'
                          : 'Dossier',
                    action: () => void select(section.id),
                  }))
                : [
                    ...commands,
                    { label: 'Reprendre le fil', action: () => memory.open({ kind: 'resume' }) },
                    { label: 'Fiches du manuscrit', action: () => memory.open({ kind: 'list' }) },
                  ].filter(
                    (command) =>
                      !['Rechercher dans les sources', 'Sources du projet'].includes(command.label),
                  )
            }
          />
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
            <span>{selected.goal.toLocaleString('fr-FR')}</span>
          </div>
        )}
        <DepthControl value={doc.settings.depth} onChange={(depth) => doc.configure({ depth })} />
        <div className="settings-control" data-open={surface === 'settings'}>
          <button
            ref={settingsTrigger}
            className="settings-trigger"
            aria-label="Réglages d’écriture"
            aria-expanded={surface === 'settings'}
            aria-controls="writing-settings"
            onClick={() => {
              setPalette(null);
              setVoiceOpen(false);
              setCard(null);
              if (memory.origin) memory.close();
              setSurface(surface === 'settings' ? 'none' : 'settings');
            }}
          >
            Aa
          </button>
          <Settings
            open={surface === 'settings'}
            value={doc.settings}
            onChange={doc.configure}
            canFormat={scenes.length > 0}
            onFormat={(format) => editor.current?.format(format)}
            onClose={() => {
              setSurface('none');
              settingsTrigger.current?.focus();
            }}
          />
        </div>
      </footer>
      <Presence kind="notice">
        {progress && (
          <div className="index-strip">
            <progress max={progress.total} value={progress.done} />
            <span>
              Préparation des sources · {progress.done} / {progress.total}
            </span>
            <button onClick={() => void request('cancelIndex')}>
              <Pause size={11} />
              Suspendre
            </button>
          </div>
        )}
      </Presence>
      <WorkspaceNotices workspace={workspace} />
      <WorkspaceDialogs workspace={workspace} onMemory={() => memory.open({ kind: 'list' })} />
    </div>
  );
}
