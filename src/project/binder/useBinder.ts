const draftId = '__ariane_new_section__';
import { t, useLocale } from '../../i18n';
import type { MouseEvent, DragEvent } from 'react';
import { sectionPath, hasChapterAncestor, canMoveToParent } from '../tree';
import type { LibraryOperation, DocumentRole } from '../../contracts/library';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useContextMenu, type MenuAction } from '../../components/ContextMenu';
import { visibleTree } from '../visibleTree';
import { branchGuides, inclusionBySection } from '../treePresentation';
import type { Section } from '../../contracts/project';
import type { BinderProps } from './types';
export function useBinder(p: BinderProps) {
  useLocale();
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
  useEffect(() => {
    const next = p.project.settings.libraryView;
    if (next === 'texts' || next === 'sources' || next === 'trash') {
      setView(next);
      setPicked([]);
    }
  }, [p.project.settings.libraryView]);
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
        label: {
          folder: t('Nouvelle section'),
          chapter: t('Nouveau chapitre'),
          scene: t('Nouvelle scène'),
        }[kind],
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
    if (p.project.settings.libraryView !== 'texts') p.onConfigure?.({ libraryView: 'texts' });
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
    if (p.project.settings.libraryView !== 'texts') p.onConfigure?.({ libraryView: 'texts' });
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
  return {
    openMenu,
    renaming,
    setRenaming,
    name,
    setName,
    renameCancelled,
    collapsed,
    setCollapsed,
    drag,
    setDrag,
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
    sections,
    changeView,
    addActions,
    choose,
    run,
    beginRename,
    allowedDrop,
    dropPlacement,
    dropAtRoot,
    nav,
    scrollTop,
    setScrollTop,
    height,
    activeAncestors,
    setFocused,
    rows,
    rowHeight,
    rowInset,
    indent,
    inclusion,
    indices,
    branches,
    focusRow,
    commitRename,
  };
}
export type BinderController = ReturnType<typeof useBinder>;
