import { BinderRow } from './binder/BinderRow';
import { useBinder } from './binder/useBinder';
import type { BinderProps } from './binder/types';
import { t } from '../i18n';
import { createPortal } from 'react-dom';
import { SidebarDock } from '../components/SidebarDock';
import { trackSidebarPointer } from './sidebarPointer';
import { Dialog } from '../components/Dialog';
import { SourceBrowser } from '../sources/Browser';
import { ProjectCatalog } from './ProjectCatalog';
import { descendants, sectionPath, canMoveToParent } from './tree';
import {
  ChevronDown,
  ChevronLeft,
  Plus,
  Copy,
  Trash2,
  Undo2,
  MoreHorizontal,
  GitCompareArrows,
  Settings2,
} from 'lucide-react';

const draftId = '__ariane_new_section__';
export function Binder(p: BinderProps) {
  const controller = useBinder(p);
  const {
    openMenu,
    collapsed,
    setCollapsed,
    drag,
    drop,
    setDrop,
    picked,
    setPicked,
    anchor,
    dropError,
    setDropError,
    dragY,
    destination,
    setDestination,
    destinationValue,
    setDestinationValue,
    projects,
    setProjects,
    view,
    role,
    trash,
    changeView,
    addActions,
    run,
    beginRename,
    dropAtRoot,
    nav,
    setScrollTop,
    setFocused,
    rows,
    rowHeight,
    indices,
    focusRow,
  } = controller;

  const footerActions = (
    <>
      <button
        aria-current={p.historyMode ? 'page' : undefined}
        aria-label={t('Versions')}
        data-tooltip={t('Versions')}
        onClick={() => p.onSurface('history')}
      >
        <GitCompareArrows size={17} aria-hidden="true" />
      </button>
      <button
        aria-label={t('Corbeille')}
        aria-pressed={trash}
        data-tooltip={t('Corbeille')}
        onClick={() => changeView('trash')}
      >
        <Trash2 size={17} aria-hidden="true" />
      </button>
      <button
        aria-label={t('Paramètres')}
        data-tooltip={t('Paramètres')}
        onClick={() => p.onSurface('preferences')}
      >
        <Settings2 size={17} aria-hidden="true" />
      </button>
    </>
  );
  return (
    <aside
      id="project-sidebar"
      inert={p.busy}
      aria-busy={p.busy}
      className="binder"
      aria-label={t('Projet')}
      onContextMenu={(event) => {
        if (
          trash ||
          view === 'sources' ||
          (event.target as HTMLElement).closest('button, input, select, .tree-row')
        )
          return;
        openMenu(event, {
          title: t('Ajouter au projet'),
          groups: [addActions(null)],
        });
      }}
    >
      <button
        className="binder-edge-trigger"
        aria-label={t('Replier la sidebar')}
        aria-controls="project-sidebar"
        aria-expanded={true}
        data-hint-while-expanded
        data-hint-placement="sidebar-edge"
        onClick={p.onClose}
        onPointerMove={trackSidebarPointer}
      >
        <ChevronLeft size={17} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="panel-top">
        <button
          className="library-project-title"
          aria-expanded={projects}
          aria-controls="sidebar-projects"
          title={p.project.name}
          onClick={() => {
            setProjects((v) => !v);
          }}
        >
          <span>{p.project.name}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
      {projects && (
        <div id="sidebar-projects" className="sidebar-projects">
          <ProjectCatalog
            searchable={false}
            currentPath={p.project.path}
            onOpen={(path) => {
              setProjects(false);
              p.onOpenProject?.(path);
            }}
            onError={p.onError}
          />
          <button className="catalog-create" onClick={() => p.onSurface('projects')}>
            {t('Créer ou ouvrir un projet…')}
          </button>
        </div>
      )}
      <div className="library-tabs" aria-label={t('Contenu du projet')}>
        <button
          aria-pressed={view === 'texts'}
          onClick={() => changeView('texts')}
          onDragOver={(e) => {
            if (drag.length) e.preventDefault();
          }}
          onDrop={(e) => dropAtRoot(e, 'manuscript')}
        >
          {t('Textes')}
        </button>
        <button aria-pressed={view === 'sources'} onClick={() => changeView('sources')}>
          {t('Sources')}
        </button>
        <div className="library-actions" role="group" aria-label={t('Actions de la bibliothèque')}>
          {view === 'texts' && (
            <button
              className="library-create icon-button"
              aria-label={t('Ajouter une section, un chapitre ou une scène')}
              data-tooltip={t('Ajouter')}
              aria-haspopup="menu"
              onClick={(event) =>
                openMenu(event, {
                  title: t('Ajouter au projet'),
                  groups: [addActions(null)],
                })
              }
            >
              <Plus size={15} aria-hidden="true" />
            </button>
          )}
          {p.onOperation && p.project.canUndoStructure && (
            <button
              className="icon-button"
              aria-label={t('Annuler le dernier rangement')}
              disabled={p.busy}
              onClick={() => void run({ action: 'undo' })}
            >
              <Undo2 size={14} aria-hidden="true" />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={t('Options de la bibliothèque')}
            aria-haspopup="menu"
            onClick={(event) =>
              openMenu(event, {
                title: t('Bibliothèque'),
                groups: [
                  [
                    { label: t('Créer ou ouvrir un projet…'), run: () => p.onSurface('projects') },
                    { label: t('Gérer les vaults…'), run: () => p.onSurface('sources') },
                    { label: t('Paramètres'), run: () => p.onSurface('preferences') },
                  ],
                ],
              })
            }
          >
            <MoreHorizontal size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {view === 'sources' ? (
        <div className="library-scroll">
          <SourceBrowser
            version={p.sourceVersion}
            onRead={(source) => p.onReadSource?.(source)}
            onManage={() => p.onSurface('sources')}
          />
        </div>
      ) : (
        <>
          {view === 'texts' && (
            <button className="binder-manuscript" onClick={p.onContinuous}>
              {t('Lire le manuscrit')}
            </button>
          )}
          {trash && (
            <p className="hint">
              {t('Restaurez un document pour le retrouver à son emplacement.')}
            </p>
          )}
          {(picked.length > 1 || (trash && picked.length > 0)) && p.onOperation && (
            <div className="library-selection" aria-label={t('Actions de sélection')}>
              <span role="status">
                {t('{0} sélectionné{1}', { 0: picked.length, 1: picked.length > 1 ? 's' : '' })}
              </span>
              {trash ? (
                <button
                  disabled={p.busy}
                  onClick={() => void run({ action: 'restore', ids: picked })}
                >
                  {t('Restaurer')}
                </button>
              ) : (
                <>
                  <button
                    disabled={p.busy}
                    onClick={() => {
                      setDestination(picked);
                      setDestinationValue('root:' + role);
                    }}
                  >
                    {t('Déplacer…')}
                  </button>
                  <button
                    disabled={p.busy}
                    aria-label={t('Dupliquer la sélection')}
                    onClick={() => void run({ action: 'duplicate', ids: picked })}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    disabled={p.busy}
                    aria-label={t('Mettre la sélection à la corbeille')}
                    onClick={() => void run({ action: 'trash', ids: picked })}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          )}
          <nav
            className="tree"
            ref={nav}
            aria-label={trash ? t('Documents supprimés') : t('Textes du projet')}
            onDragOver={(e) => {
              if (drag.length && !trash) {
                e.preventDefault();
                dragY.current = e.clientY;
                setDrop(null);
                setDropError('');
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                dragY.current = null;
                setDrop(null);
                setDropError('');
              }
            }}
            onDrop={(e) => {
              if (!trash) dropAtRoot(e);
            }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setFocused(null);
            }}
            onKeyDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('input')) return;
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                setPicked(
                  rows
                    .filter((r) => r.section.id !== draftId)
                    .map((r) => r.section.id)
                    .filter((id) => id !== draftId),
                );
                return;
              }
              if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === 'z' &&
                p.project.canUndoStructure
              ) {
                event.preventDefault();
                void run({ action: 'undo' });
                return;
              }
              if (
                (event.key === 'Backspace' || event.key === 'Delete') &&
                picked.length &&
                !trash
              ) {
                event.preventDefault();
                void run({ action: 'trash', ids: picked });
                return;
              }
              const element = target.closest<HTMLElement>('[data-row-index]');
              if (!element) return;
              const index = Number(element.dataset.rowIndex);
              const item = rows[index]?.section;
              if (!item || item.id === draftId) return;
              if (event.key === 'F2' && !trash && p.onRename) {
                event.preventDefault();
                beginRename(item);
                return;
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                if (item.kind !== 'scene' && collapsed.has(item.id))
                  setCollapsed((old) => {
                    const next = new Set(old);
                    next.delete(item.id);
                    return next;
                  });
                else if (rows[index + 1]?.section.parent === item.id) focusRow(index + 1);
                return;
              }
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                if (item.kind !== 'scene' && !collapsed.has(item.id))
                  setCollapsed((old) => new Set(old).add(item.id));
                else {
                  const parentIndex = rows.findIndex((r) => r.section.id === item.parent);
                  if (parentIndex >= 0) focusRow(parentIndex);
                }
                return;
              }
              const destination =
                event.key === 'ArrowDown'
                  ? index + 1
                  : event.key === 'ArrowUp'
                    ? index - 1
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? rows.length - 1
                        : null;
              if (destination !== null) {
                event.preventDefault();
                const next = Math.max(0, Math.min(rows.length - 1, destination));
                if (event.shiftKey) {
                  const start = rows.findIndex((r) => r.section.id === anchor.current);
                  if (start < 0) anchor.current = rows[index].section.id;
                  const from = start < 0 ? index : start;
                  setPicked(
                    rows
                      .slice(Math.min(from, next), Math.max(from, next) + 1)
                      .map((r) => r.section.id)
                      .filter((id) => id !== draftId),
                  );
                }
                focusRow(next);
              }
              if (event.key === 'Tab') {
                const buttons = element.querySelectorAll('button');
                const leaving = event.shiftKey
                  ? target === buttons[0]
                  : target === buttons[buttons.length - 1];
                const next = index + (event.shiftKey ? -1 : 1);
                if (leaving && rows[next] && !indices.has(next)) {
                  event.preventDefault();
                  focusRow(next, event.shiftKey);
                }
              }
            }}
          >
            <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
              {[...indices]
                .sort((a, b) => a - b)
                .map((index) => (
                  <BinderRow
                    key={rows[index].section.id}
                    index={index}
                    p={p}
                    controller={controller}
                  />
                ))}
            </div>
          </nav>
          {!rows.length && (
            <p className="hint">
              {trash ? t('La corbeille est vide.') : t('Vos textes apparaîtront ici.')}
            </p>
          )}
          {!trash && (
            <div
              className="library-root-drop"
              role="status"
              onDragOver={(e) => {
                if (drag.length) {
                  e.preventDefault();
                  setDrop(null);
                  setDropError('');
                  dragY.current = null;
                }
              }}
              onDrop={(e) => dropAtRoot(e)}
            >
              {drag.length
                ? dropError ||
                  (drop
                    ? `${drop.placement === 'inside' ? t('Dans') : drop.placement === 'before' ? t('Avant') : t('Après')} ${p.project.sections.find((s) => s.id === drop.id)?.title || t('Sans titre')}`
                    : t('Déposer à la racine'))
                : ''}
            </div>
          )}
        </>
      )}
      {p.footerTarget === undefined ? (
        <SidebarDock expanded dark={!!p.dark} onToggleTheme={p.onToggleTheme} busy={p.busy}>
          {footerActions}
        </SidebarDock>
      ) : (
        p.footerTarget && createPortal(footerActions, p.footerTarget)
      )}
      {destination && (
        <Dialog title={t('Déplacer la sélection')} onClose={() => setDestination(null)}>
          <label>
            {t('Destination')}
            <select
              aria-label={t('Destination')}
              value={destinationValue}
              onChange={(e) => setDestinationValue(e.target.value)}
            >
              <option value="root:manuscript">{t('Textes · Racine')}</option>
              {p.project.sections
                .filter(
                  (s) =>
                    s.kind !== 'scene' &&
                    canMoveToParent(
                      [...p.project.sections, ...(p.project.trash ?? [])],
                      destination,
                      s.id,
                    ) &&
                    !destination.some((id) =>
                      descendants(p.project.sections, id).some((child) => child.id === s.id),
                    ),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {t('Textes /')}{' '}
                    {sectionPath(p.project.sections, s)
                      .map((s) => s.title || t('Sans titre'))
                      .join(' / ')}
                  </option>
                ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button onClick={() => setDestination(null)}>{t('Annuler')}</button>
            <button
              className="primary"
              disabled={p.busy}
              onClick={() =>
                void run({
                  action: 'move',
                  ids: destination,
                  target: destinationValue.startsWith('root:') ? null : destinationValue,
                  role: 'manuscript',
                })
              }
            >
              {t('Déplacer')}
            </button>
          </div>
        </Dialog>
      )}
    </aside>
  );
}
