import { ThemeSwitcher } from '../components/ThemeSwitcher';
import type { MouseEvent, DragEvent, CSSProperties } from 'react';
import { trackSidebarPointer } from './sidebarPointer';
import { Dialog } from '../components/Dialog';
import { SourceBrowser } from '../sources/Browser';
import { ProjectCatalog } from './ProjectCatalog';
import type { ManuscriptOperation } from './library';
import { descendants, sectionPath, hasChapterAncestor, canMoveToParent } from './tree';
import type { LibraryOperation, DocumentRole } from './library';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useContextMenu, type MenuAction } from '../components/ContextMenu';
import { visibleTree } from './visibleTree';
import { branchGuides, inclusionBySection } from './treePresentation';
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  FileText,
  Folder,
  BookOpen,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Undo2,
  MoreHorizontal,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { Project, Section, Surface, Source, Settings as ProjectSettings } from '../app/types';
interface Props {
  dark?: boolean;
  onToggleTheme?: () => void;
  project: Project;
  active: string | null;
  onSelect: (id: string) => void;
  onSurface: (s: Surface) => void;
  onClose: () => void;
  onAdd: (
    parent: string | null,
    kind: Section['kind'],
    role?: DocumentRole,
    after?: string,
  ) => void;
  creation?: { parent: string | null; kind: Section['kind']; after?: string } | null;
  reveal?: number;
  onRevealed?: () => void;
  creationTitle?: string;
  onCreationTitle?: (title: string) => void;
  onConfirmCreation?: () => Promise<void>;
  onCancelCreation?: () => void;
  onMove: (id: string, target: string, inside: boolean) => void;
  onContinuous: () => void;
  onRename?: (id: string, title: string) => Promise<void>;
  onOperation?: (operation: LibraryOperation) => Promise<void>;
  onConfigure?: (patch: Partial<ProjectSettings>) => void;
  onReadSource?: (source: Source) => unknown;
  onOpenProject?: (path: string, section?: string) => unknown;
  onError?: (e: unknown) => void;
  sourceVersion?: number;
  busy?: boolean;
  onPrepare?: (id: string) => unknown;
  onManuscriptOperation?: (operation: ManuscriptOperation) => Promise<void>;
}
const draftId = '__ariane_new_section__';
export function Binder(p: Props) {
  const openMenu = useContextMenu();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const renameCancelled = useRef(false);
  const [collapsed, setCollapsed] = useState(new Set<string>(p.project.settings.collapsed || []));
  const [drag, setDrag] = useState<string[]>([]);
  const [drop, setDrop] = useState<{ id: string; placement: 'before' | 'after' | 'inside' } | null>(
    null,
  );
  const [picked, setPicked] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const [dropError, setDropError] = useState('');
  const dragY = useRef<number | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const previousActive = useRef(p.active);
  const [destination, setDestination] = useState<string[] | null>(null);
  const [destinationValue, setDestinationValue] = useState('root:manuscript');
  const [projects, setProjects] = useState(false);
  const [view, setView] = useState<'texts' | 'sources' | 'trash'>(
    p.project.settings.libraryView === 'sources' || p.project.settings.libraryView === 'trash'
      ? p.project.settings.libraryView
      : 'texts',
  );
  const role: DocumentRole = 'manuscript';
  const trash = view === 'trash';
  const sections = useMemo(() => {
    const values = trash ? p.project.trash || [] : p.project.sections;
    const ids = new Set(values.map((s) => s.id));
    return values.map((s) => (s.parent && !ids.has(s.parent) ? { ...s, parent: null } : s));
  }, [p.project.sections, p.project.trash, role, trash]);
  useEffect(() => {
    p.onConfigure?.({ collapsed: [...collapsed] });
  }, [collapsed]);
  function changeView(next: typeof view) {
    setView(next);
    p.onConfigure?.({ libraryView: next });
    setPicked([]);
  }
  function addActions(parent: Section | null): MenuAction[] {
    const kinds: Section['kind'][] =
      parent?.kind === 'chapter'
        ? ['scene', 'chapter', 'folder']
        : parent
          ? ['chapter', 'scene', 'folder']
          : ['folder', 'chapter', 'scene'];
    return kinds
      .filter(
        (kind) => kind !== 'chapter' || !hasChapterAncestor(p.project.sections, parent?.id ?? null),
      )
      .map((kind) => ({
        label: { folder: 'Nouvelle section', chapter: 'Nouveau chapitre', scene: 'Nouvelle scène' }[
          kind
        ],
        run: () => {
          if (parent)
            setCollapsed((old) => {
              const next = new Set(old);
              next.delete(parent.id);
              return next;
            });
          p.onAdd(parent?.id ?? null, kind, role);
        },
      }));
  }
  function choose(id: string, event: MouseEvent) {
    if (event.shiftKey && anchor.current) {
      const from = rows.findIndex((r) => r.section.id === anchor.current),
        to = rows.findIndex((r) => r.section.id === id);
      if (from >= 0)
        setPicked(
          rows
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .map((r) => r.section.id)
            .filter((id) => id !== draftId),
        );
    } else if (event.metaKey || event.ctrlKey) {
      setPicked((old) => (old.includes(id) ? old.filter((v) => v !== id) : [...old, id]));
      anchor.current = id;
    } else {
      setPicked([id]);
      anchor.current = id;
      if (!trash) p.onSelect(id);
    }
  }
  async function run(operation: LibraryOperation) {
    if (p.busy) return;
    await p.onOperation?.(operation);
    setPicked([]);
    setDestination(null);
  }
  function beginRename(s: Section) {
    renameCancelled.current = false;
    setName(s.title);
    setRenaming(s.id);
  }
  function allowedDrop(section: Section, placement: 'before' | 'after' | 'inside') {
    return canMoveToParent(
      [...p.project.sections, ...(p.project.trash ?? [])],
      drag,
      placement === 'inside' ? section.id : section.parent,
    );
  }
  function dropPlacement(event: DragEvent, section: Section) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    return section.kind !== 'scene' && ratio > 0.25 && ratio < 0.75
      ? 'inside'
      : ratio < 0.5
        ? 'before'
        : 'after';
  }
  function dropAtRoot(event: DragEvent, targetRole: DocumentRole = role) {
    event.preventDefault();
    if (drag.length) void run({ action: 'move', ids: drag, target: null, role: targetRole });
    setDrag([]);
    setDrop(null);
  }
  const nav = useRef<HTMLElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    if (!drag.length) {
      dragY.current = null;
      setDropError('');
      return;
    }
    let frame: number;
    const tick = () => {
      const element = nav.current;
      if (element && dragY.current !== null) {
        const rect = element.getBoundingClientRect();
        const y = dragY.current;
        const speed =
          y < rect.top + 36
            ? -Math.min(12, (rect.top + 36 - y) / 3)
            : y > rect.bottom - 36
              ? Math.min(12, (y - rect.bottom + 36) / 3)
              : 0;
        if (speed) {
          element.scrollTop = Math.max(
            0,
            Math.min(element.scrollHeight - element.clientHeight, element.scrollTop + speed),
          );
          setScrollTop(element.scrollTop);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag.length]);
  useEffect(() => {
    if (!drag.length || drop?.placement !== 'inside' || !collapsed.has(drop.id)) return;
    const id = drop.id;
    const timer = setTimeout(
      () =>
        setCollapsed((old) => {
          const next = new Set(old);
          next.delete(id);
          return next;
        }),
      550,
    );
    return () => clearTimeout(timer);
  }, [drag.length, drop?.id, drop?.placement, collapsed]);
  useEffect(() => {
    const changed = previousActive.current !== p.active;
    previousActive.current = p.active;
    if (!p.active || (!changed && !p.reveal)) return;
    const ancestors = sectionPath(
      p.project.sections,
      p.project.sections.find((s) => s.id === p.active),
    ).slice(0, -1);
    setCollapsed((old) => {
      const next = new Set(old);
      for (const s of ancestors) next.delete(s.id);
      return next;
    });
    setPicked([]);
    setView('texts');
    setRevealId(p.active);
    p.onRevealed?.();
  }, [p.active, p.reveal]);
  const activeAncestors = new Set(
    sectionPath(
      p.project.sections,
      p.project.sections.find((s) => s.id === p.active),
    )
      .slice(0, -1)
      .map((s) => s.id),
  );
  const [focused, setFocused] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (!p.creation) return visibleTree(sections, collapsed);
    const draft: Section = {
      id: draftId,
      title: '',
      kind: p.creation.kind,
      parent: p.creation.parent,
      position: p.creation.after
        ? (sections.find((s) => s.id === p.creation?.after)?.position ?? 0) + 0.5
        : sections.reduce((max, s) => Math.max(max, s.position), -1) + 1,
      text: '',
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
    };
    return visibleTree([...sections, draft], collapsed);
  }, [sections, collapsed, p.creation]);
  useEffect(() => {
    if (!p.creation) return;
    setView('texts');
    const parent = p.project.sections.find((s) => s.id === p.creation?.parent);
    const ancestors = sectionPath(p.project.sections, parent);
    setCollapsed((old) => {
      const next = new Set(old);
      for (const s of ancestors) next.delete(s.id);
      return next;
    });
  }, [p.creation]);
  const rowHeight = 38;
  const rowInset = 28;
  const indent = 14;
  const inclusion = useMemo(() => inclusionBySection(p.project.sections), [p.project.sections]);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + 6);
  const indices = new Set(Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i));
  const branches = useMemo(() => branchGuides(rows), [rows]);
  const focusedIndex = focused ? rows.findIndex((row) => row.section.id === focused) : -1;
  if (focusedIndex >= 0) indices.add(focusedIndex);
  const draftIndex = rows.findIndex((row) => row.section.id === draftId);
  if (draftIndex >= 0) indices.add(draftIndex);
  useLayoutEffect(() => {
    const element = nav.current;
    if (!element || draftIndex < 0) return;
    const top = draftIndex * rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + rowHeight > element.scrollTop + element.clientHeight)
      element.scrollTop = Math.max(0, top + rowHeight - element.clientHeight);
    setScrollTop(element.scrollTop);
    element.querySelector<HTMLInputElement>('.tree-create input')?.focus();
  }, [p.creation, draftIndex, view, height]);
  useLayoutEffect(() => {
    const element = nav.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight || 600);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [view, projects]);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const max = Math.max(0, rows.length * rowHeight - element.clientHeight);
    if (element.scrollTop > max) element.scrollTop = max;
    setScrollTop(element.scrollTop);
  }, [rows.length]);
  useLayoutEffect(() => {
    if (!revealId || !nav.current || view !== 'texts') return;
    const index = rows.findIndex((r) => r.section.id === revealId);
    if (index < 0) return;
    const element = nav.current;
    const top = index * rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + rowHeight > element.scrollTop + element.clientHeight)
      element.scrollTop = Math.max(0, top + rowHeight - element.clientHeight);
    setScrollTop(element.scrollTop);
    setRevealId(null);
  }, [revealId, rows, view, height]);
  const focusRow = (index: number, lastButton = false) => {
    const element = nav.current;
    if (!element || !rows[index]) return;
    const top = index * rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + rowHeight > element.scrollTop + element.clientHeight)
      element.scrollTop = top + rowHeight - element.clientHeight;
    setScrollTop(element.scrollTop);
    setFocused(rows[index].section.id);
    requestAnimationFrame(() => {
      const row = element.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
      const buttons = row?.querySelectorAll<HTMLButtonElement>('button');
      if (lastButton) buttons?.[buttons.length - 1]?.focus();
      else row?.querySelector<HTMLButtonElement>('.tree-title')?.focus();
    });
  };
  const commitRename = () => {
    const id = renaming,
      title = name.trim();
    setRenaming(null);
    if (id && title && !renameCancelled.current) void p.onRename?.(id, title);
  };
  function row(index: number) {
    const { section: s, depth } = rows[index];
    const branch = branches[index];
    const count = inclusion.get(s.id) ?? { total: 0, included: 0 };
    const fullyIncluded = count.total > 0 && count.included === count.total;
    const mixed = count.included > 0 && !fullyIncluded;
    const toggleLabel =
      count.total === 0
        ? 'Aucun texte à inclure'
        : `${mixed ? 'Inclusion partielle · ' : ''}${fullyIncluded ? 'Exclure du manuscrit' : 'Inclure dans le manuscrit'} : ${s.title || 'Sans titre'}`;
    const guides = (
      <span className="tree-guides" aria-hidden="true">
        {branch.guides.map(
          (continues, level) =>
            continues && (
              <span
                key={level}
                className="tree-guide"
                style={{ left: rowInset + 12 + level * indent }}
              />
            ),
        )}
        {depth > 0 && (
          <span
            className="tree-connector"
            data-last={branch.isLast}
            style={{ left: rowInset + 12 + (depth - 1) * indent, width: indent }}
          />
        )}
        {branch.hasChildren && (
          <span className="tree-stem" style={{ left: rowInset + 12 + depth * indent }} />
        )}
      </span>
    );
    if (s.id === draftId)
      return (
        <form
          key={draftId}
          className="tree-row tree-create"
          style={{
            position: 'absolute',
            top: index * rowHeight,
            left: 0,
            right: 0,
            height: rowHeight,
            paddingLeft: rowInset + depth * indent,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void p.onConfirmCreation?.();
          }}
        >
          {guides}
          <span
            className="tree-inclusion draft-inclusion"
            title="Inclus dans le manuscrit"
            aria-hidden="true"
          >
            <Eye size={14} />
          </span>
          <span className="disclose-spacer" aria-hidden="true" />
          <span className="creation-marker" aria-hidden="true">
            {s.kind === 'scene' ? (
              <FileText size={12} />
            ) : s.kind === 'chapter' ? (
              <BookOpen size={13} />
            ) : (
              <Folder size={13} />
            )}
          </span>
          <input
            autoFocus
            className="tree-rename"
            aria-label={
              { folder: 'Nom de la section', chapter: 'Nom du chapitre', scene: 'Nom de la scène' }[
                s.kind
              ]
            }
            placeholder={
              { folder: 'Nouvelle section', chapter: 'Nouveau chapitre', scene: 'Nouvelle scène' }[
                s.kind
              ]
            }
            value={p.creationTitle ?? ''}
            onChange={(event) => p.onCreationTitle?.(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                p.onCancelCreation?.();
              }
            }}
          />
          <button
            className="icon-button"
            type="submit"
            aria-label="Valider le nom"
            disabled={p.busy || !p.creationTitle?.trim()}
          >
            <Check size={13} />
          </button>
        </form>
      );
    return (
      <div
        key={s.id}
        data-row-index={index}
        data-kind={s.kind}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('input')) return;
          const ids = picked.includes(s.id) ? picked : [s.id];
          if (!picked.includes(s.id)) setPicked(ids);
          const actions: MenuAction[] = [
            ...(trash ? [] : [{ label: 'Ouvrir', icon: FileText, run: () => p.onSelect(s.id) }]),
          ];
          if (p.onRename && !trash && ids.length === 1)
            actions.push({
              label: 'Renommer',
              icon: Pencil,
              shortcut: 'F2',
              run: () => beginRename(s),
            });
          if (p.onPrepare && !trash && ids.length === 1)
            actions.push({ label: 'Préparer cette section', run: () => p.onPrepare!(s.id) });
          if (p.onManuscriptOperation && !trash && s.kind === 'scene' && ids.length === 1) {
            const siblings = p.project.sections.filter((item) => item.kind === 'scene' && item.parent === s.parent && item.role === s.role);
            const next = siblings[siblings.findIndex((item) => item.id === s.id) + 1];
            if (next) actions.push({
              label: `Réunir avec « ${next.title || 'Sans titre'} »`,
              run: () => void p.onManuscriptOperation!({ action: 'join', sourceId: s.id, targetId: next.id }),
            });
          }
          if (s.kind !== 'scene' && p.project.sections.some((child) => child.parent === s.id))
            actions.push({
              label: collapsed.has(s.id) ? 'Déplier' : 'Replier',
              icon: collapsed.has(s.id) ? ChevronRight : ChevronDown,
              run: () =>
                setCollapsed((old) => {
                  const next = new Set(old);
                  if (next.has(s.id)) next.delete(s.id);
                  else next.add(s.id);
                  return next;
                }),
            });
          openMenu(event, {
            title: s.title,
            detail: { scene: 'Scène', chapter: 'Chapitre', folder: 'Section' }[s.kind],
            groups: [
              actions,
              p.onOperation
                ? trash
                  ? [{ label: 'Restaurer', run: () => run({ action: 'restore', ids }) }]
                  : [
                      {
                        label: 'Déplacer vers…',
                        run: () => {
                          setDestination(ids);
                          setDestinationValue('root:' + role);
                        },
                      },
                      {
                        label: 'Dupliquer',
                        icon: Copy,
                        run: () => run({ action: 'duplicate', ids }),
                      },
                      {
                        label: 'Mettre à la corbeille',
                        icon: Trash2,
                        run: () => run({ action: 'trash', ids }),
                      },
                    ]
                : [],
              !trash
                ? s.kind !== 'scene'
                  ? addActions(s)
                  : [
                      {
                        label: 'Nouvelle scène après celle-ci',
                        icon: Plus,
                        run: () => p.onAdd(s.parent, 'scene', role, s.id),
                      },
                    ]
                : [],
              !trash &&
              p.onOperation &&
              ids.some((id) =>
                descendants(p.project.sections, id).some((item) => item.kind === 'scene'),
              )
                ? [
                    {
                      label: ids
                        .flatMap((id) => descendants(p.project.sections, id))
                        .filter((item) => item.kind === 'scene')
                        .every((item) => item.included !== false)
                        ? s.kind === 'scene'
                          ? 'Exclure du manuscrit'
                          : 'Exclure les textes du manuscrit'
                        : s.kind === 'scene'
                          ? 'Inclure dans le manuscrit'
                          : 'Inclure les textes dans le manuscrit',
                      run: () =>
                        run({
                          action: 'include',
                          ids,
                          included: !ids
                            .flatMap((id) => descendants(p.project.sections, id))
                            .filter((item) => item.kind === 'scene')
                            .every((item) => item.included !== false),
                        }),
                    },
                  ]
                : [],
              typeof navigator.clipboard?.writeText === 'function'
                ? [
                    {
                      label: 'Copier le titre',
                      icon: Copy,
                      run: () => navigator.clipboard.writeText(s.title),
                    },
                  ]
                : [],
            ],
          });
        }}
        onFocus={() => setFocused(s.id)}
        className={
          'tree-row ' +
          (picked.length > 1 && picked.includes(s.id) ? 'selected ' : '') +
          (drop?.id === s.id ? 'drop-' + drop.placement : '')
        }
        data-selected={picked.includes(s.id)}
        data-active={p.active === s.id && !trash}
        data-active-within={collapsed.has(s.id) && activeAncestors.has(s.id) && !trash}
        data-excluded={s.included === false}
        title={s.title + (s.included === false ? ' · Hors manuscrit' : '')}
        style={
          {
            '--tree-indent': `${rowInset + depth * indent}px`,
            paddingLeft: rowInset + depth * indent,
            position: 'absolute',
            top: index * rowHeight,
            left: 0,
            right: 0,
            height: rowHeight,
          } as CSSProperties
        }
        draggable={!trash && !p.busy}
        onDragStart={(e) => {
          const ids = picked.includes(s.id) ? picked : [s.id];
          setDrag(ids);
          setPicked(ids);
          e.dataTransfer.setData('application/x-ariane-section', JSON.stringify(ids));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDrag([]);
          setDrop(null);
        }}
        onDragOver={(e) => {
          if (!trash && drag.length) {
            e.stopPropagation();
            dragY.current = e.clientY;
            const placement = dropPlacement(e, s);
            if (!allowedDrop(s, placement)) {
              e.dataTransfer.dropEffect = 'none';
              setDropError(
                hasChapterAncestor(p.project.sections, placement === 'inside' ? s.id : s.parent) &&
                  drag.some((id) =>
                    descendants(p.project.sections, id).some((item) => item.kind === 'chapter'),
                  )
                  ? 'Un chapitre ne peut pas contenir un autre chapitre.'
                  : 'Impossible de déplacer un élément dans sa propre branche.',
              );
              setDrop(null);
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropError('');
            setDrop((old) =>
              old?.id === s.id && old.placement === placement ? old : { id: s.id, placement },
            );
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!trash && drag.length) {
            const placement = dropPlacement(e, s);
            if (!allowedDrop(s, placement)) {
              setDrag([]);
              setDrop(null);
              return;
            }
            if (p.onOperation) void run({ action: 'move', ids: drag, target: s.id, placement });
            else p.onMove(drag[0], s.id, placement === 'inside');
          }
          setDrag([]);
          setDrop(null);
        }}
      >
        {guides}
        {!trash && (
          <button
            className="tree-inclusion"
            disabled={p.busy || !p.onOperation || !count.total}
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={mixed ? 'mixed' : fullyIncluded}
            onClick={(event) => {
              event.stopPropagation();
              void run({ action: 'include', ids: [s.id], included: !fullyIncluded });
            }}
          >
            {count.included ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        )}
        {s.kind !== 'scene' ? (
          <button
            className="disclose"
            aria-label={(collapsed.has(s.id) ? 'Déplier ' : 'Replier ') + (s.title || 'Sans titre')}
            aria-expanded={!collapsed.has(s.id)}
            onClick={() =>
              setCollapsed((old) => {
                const next = new Set(old);
                if (next.has(s.id)) next.delete(s.id);
                else next.add(s.id);
                return next;
              })
            }
          >
            <ChevronRight size={12} style={{ rotate: collapsed.has(s.id) ? '0deg' : '90deg' }} />
          </button>
        ) : (
          <span className="disclose-spacer" aria-hidden="true" />
        )}
        <span
          className="tree-type-icon"
          title={{ folder: 'Section', chapter: 'Chapitre', scene: 'Scène' }[s.kind]}
          aria-hidden="true"
        >
          {s.kind === 'chapter' ? (
            <BookOpen size={14} />
          ) : s.kind === 'folder' ? (
            <Folder size={14} />
          ) : (
            <FileText size={14} />
          )}
        </span>
        {renaming === s.id ? (
          <input
            className="tree-rename"
            aria-label="Nouveau titre"
            autoFocus
            value={name}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                commitRename();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                renameCancelled.current = true;
                setRenaming(null);
              }
            }}
          />
        ) : (
          <button
            className="tree-title"
            aria-current={p.active === s.id ? 'page' : undefined}
            aria-label={`${{ folder: 'Section', chapter: 'Chapitre', scene: 'Scène' }[s.kind]} : ${s.title || 'Sans titre'}${s.included === false ? ' · Hors manuscrit' : ''}`}
            onClick={(e) => choose(s.id, e)}
          >
            {s.title || 'Sans titre'}
          </button>
        )}
        {s.kind !== 'scene' && !trash && (
          <button
            className="row-add"
            aria-label={'Ajouter dans ' + s.title}
            aria-haspopup="menu"
            onClick={(event) =>
              openMenu(event, { title: 'Ajouter dans ' + s.title, groups: [addActions(s)] })
            }
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    );
  }
  return (
    <aside
      id="project-sidebar"
      inert={p.busy}
      aria-busy={p.busy}
      className="binder"
      aria-label="Projet"
      onContextMenu={(event) => {
        if (
          trash ||
          view === 'sources' ||
          (event.target as HTMLElement).closest('button, input, select, .tree-row')
        )
          return;
        openMenu(event, {
          title: 'Ajouter au projet',
          groups: [addActions(null)],
        });
      }}
    >
      <button
        className="binder-edge-trigger"
        aria-label="Replier la sidebar"
        aria-controls="project-sidebar"
        aria-expanded={true}
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
            Créer ou ouvrir un projet…
          </button>
        </div>
      )}
      <div className="library-tabs" aria-label="Contenu du projet">
        <button
          aria-pressed={view === 'texts'}
          onClick={() => changeView('texts')}
          onDragOver={(e) => {
            if (drag.length) e.preventDefault();
          }}
          onDrop={(e) => dropAtRoot(e, 'manuscript')}
        >
          Textes
        </button>
        <button aria-pressed={view === 'sources'} onClick={() => changeView('sources')}>
          Sources
        </button>
        {view === 'texts' && (
          <button
            className="library-create icon-button"
            aria-label="Ajouter une section, un chapitre ou une scène"
            aria-haspopup="menu"
            onClick={(event) =>
              openMenu(event, {
                title: 'Ajouter au projet',
                groups: [addActions(null)],
              })
            }
          >
            <Plus size={15} />
          </button>
        )}
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
              Lire le manuscrit
            </button>
          )}
          {trash && (
            <p className="hint">Restaurez un document pour le retrouver à son emplacement.</p>
          )}
          {(picked.length > 1 || (trash && picked.length > 0)) && p.onOperation && (
            <div className="library-selection" aria-label="Actions de sélection">
              <span role="status">
                {picked.length} sélectionné{picked.length > 1 ? 's' : ''}
              </span>
              {trash ? (
                <button
                  disabled={p.busy}
                  onClick={() => void run({ action: 'restore', ids: picked })}
                >
                  Restaurer
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
                    Déplacer…
                  </button>
                  <button
                    disabled={p.busy}
                    title="Dupliquer la sélection"
                    aria-label="Dupliquer la sélection"
                    onClick={() => void run({ action: 'duplicate', ids: picked })}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    disabled={p.busy}
                    title="Mettre la sélection à la corbeille"
                    aria-label="Mettre la sélection à la corbeille"
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
            aria-label={trash ? 'Documents supprimés' : 'Textes du projet'}
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
              {[...indices].sort((a, b) => a - b).map(row)}
            </div>
          </nav>
          {!rows.length && (
            <p className="hint">
              {trash ? 'La corbeille est vide.' : 'Vos textes apparaîtront ici.'}
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
                    ? `${drop.placement === 'inside' ? 'Dans' : drop.placement === 'before' ? 'Avant' : 'Après'} ${p.project.sections.find((s) => s.id === drop.id)?.title || 'Sans titre'}`
                    : 'Déposer à la racine')
                : ''}
            </div>
          )}
        </>
      )}
      <div className="binder-bottom">
        <button onClick={() => p.onSurface('history')}>Versions</button>
        {!!p.project.trash?.length && (
          <button aria-label="Corbeille" aria-pressed={trash} onClick={() => changeView('trash')}>
            Corbeille
          </button>
        )}
        <div className="library-footer-tools">
          {p.onOperation && p.project.canUndoStructure && (
            <button
              className="icon-button"
              aria-label="Annuler le dernier rangement"
              title="Annuler le dernier rangement"
              disabled={p.busy}
              onClick={() => void run({ action: 'undo' })}
            >
              <Undo2 size={14} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Options de la bibliothèque"
            aria-haspopup="menu"
            onClick={(event) =>
              openMenu(event, {
                title: 'Bibliothèque',
                groups: [
                  [
                  ],
                  [
                    { label: 'Créer ou ouvrir un projet…', run: () => p.onSurface('projects') },
                    { label: 'Gérer les vaults…', run: () => p.onSurface('sources') },
                    { label: 'Paramètres', run: () => p.onSurface('preferences') },
                  ],
                ],
              })
            }
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>
      <div className="binder-preferences">
        <button onClick={() => p.onSurface('preferences')}>Paramètres</button>
        {p.onToggleTheme && <ThemeSwitcher dark={!!p.dark} onChange={p.onToggleTheme} />}
      </div>
      {destination && (
        <Dialog title="Déplacer la sélection" onClose={() => setDestination(null)}>
          <label>
            Destination
            <select
              aria-label="Destination"
              value={destinationValue}
              onChange={(e) => setDestinationValue(e.target.value)}
            >
              <option value="root:manuscript">Textes · Racine</option>
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
                    Textes /{' '}
                    {sectionPath(p.project.sections, s)
                      .map((s) => s.title || 'Sans titre')
                      .join(' / ')}
                  </option>
                ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button onClick={() => setDestination(null)}>Annuler</button>
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
              Déplacer
            </button>
          </div>
        </Dialog>
      )}
    </aside>
  );
}
