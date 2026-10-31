import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { visibleTree } from './visibleTree';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileText,
  Folder,
  Plus,
  BookOpen,
  History,
  Library,
} from 'lucide-react';
import type { Project, Section, Surface } from '../app/types';
interface Props {
  project: Project;
  active: string | null;
  onSelect: (id: string) => void;
  onSurface: (s: Surface) => void;
  onClose: () => void;
  onAdd: (parent: string | null, kind: Section['kind']) => void;
  onMove: (id: string, target: string, inside: boolean) => void;
  onContinuous: () => void;
}
export function Binder(p: Props) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [drag, setDrag] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [focused, setFocused] = useState<string | null>(null);
  const rows = useMemo(
    () => visibleTree(p.project.sections, collapsed),
    [p.project.sections, collapsed],
  );
  const rowHeight = 38;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + 6);
  const indices = new Set(Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i));
  const focusedIndex = focused ? rows.findIndex((row) => row.section.id === focused) : -1;
  if (focusedIndex >= 0) indices.add(focusedIndex);
  useLayoutEffect(() => {
    const element = nav.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight || 600);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const max = Math.max(0, rows.length * rowHeight - element.clientHeight);
    if (element.scrollTop > max) element.scrollTop = max;
    setScrollTop(element.scrollTop);
  }, [rows.length]);
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
  function row(index: number) {
    const { section: s, depth } = rows[index];
    return (
      <div
        key={s.id}
        data-row-index={index}
        onFocus={() => setFocused(s.id)}
        className={'tree-row ' + (p.active === s.id ? 'selected' : '')}
        style={{
          paddingLeft: 8 + Math.min(depth, 6) * 14,
          position: 'absolute',
          top: index * rowHeight,
          left: 0,
          right: 0,
          height: rowHeight,
        }}
        draggable
        onDragStart={(e) => {
          setDrag(s.id);
          e.dataTransfer.setData('application/x-ariane-section', s.id);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (drag && drag !== s.id) p.onMove(drag, s.id, s.kind !== 'scene');
          setDrag(null);
        }}
      >
        <button
          className="disclose"
          aria-label={
            s.kind === 'scene'
              ? 'Sélectionner ' + s.title
              : (collapsed.has(s.id) ? 'Déplier ' : 'Replier ') + s.title
          }
          aria-expanded={s.kind === 'scene' ? undefined : !collapsed.has(s.id)}
          onClick={() =>
            s.kind === 'scene'
              ? p.onSelect(s.id)
              : setCollapsed((old) => {
                  const v = new Set(old);
                  if (v.has(s.id)) v.delete(s.id);
                  else v.add(s.id);
                  return v;
                })
          }
        >
          {s.kind !== 'scene' ? (
            collapsed.has(s.id) ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )
          ) : (
            <FileText size={12} />
          )}
        </button>
        <button
          className="tree-title"
          aria-current={p.active === s.id ? 'page' : undefined}
          onClick={() => p.onSelect(s.id)}
        >
          {s.title}
        </button>
        {s.kind !== 'scene' && (
          <button
            className="row-add"
            aria-label={'Ajouter dans ' + s.title}
            onClick={() => p.onAdd(s.id, 'scene')}
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    );
  }
  return (
    <aside id="project-sidebar" className="binder" aria-label="Classeur du projet">
      <button
        className="binder-edge-trigger"
        aria-label="Replier la sidebar"
        aria-controls="project-sidebar"
        aria-expanded={true}
        onClick={p.onClose}
      >
        <ChevronLeft size={17} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="panel-top">
        <span>{p.project.name}</span>
      </div>
      <button className="binder-manuscript" onClick={p.onContinuous}>
        <Folder size={16} /> Manuscrit entier
      </button>
      <nav
        className="tree"
        ref={nav}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          const element = target.closest<HTMLElement>('[data-row-index]');
          if (!element) return;
          const index = Number(element.dataset.rowIndex);
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
            focusRow(Math.max(0, Math.min(rows.length - 1, destination)));
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
      <div className="binder-add">
        <button title="Ajouter à la racine du projet" onClick={() => p.onAdd(null, 'scene')}>
          <Plus size={13} />
          Scène
        </button>
        <button title="Ajouter à la racine du projet" onClick={() => p.onAdd(null, 'chapter')}>
          <Plus size={13} />
          Chapitre
        </button>
        <button title="Ajouter à la racine du projet" onClick={() => p.onAdd(null, 'folder')}>
          <Plus size={13} />
          Dossier
        </button>
      </div>
      <div className="binder-bottom">
        <button onClick={() => p.onSurface('prepare')}>
          <FileText size={16} />
          Préparation
        </button>
        <button onClick={() => p.onSurface('sources')}>
          <Library size={16} />
          Sources
        </button>
        <button onClick={() => p.onSurface('history')}>
          <History size={16} />
          Versions
        </button>
        <button onClick={() => p.onSurface('projects')}>
          <BookOpen size={16} />
          Projets
        </button>
      </div>
    </aside>
  );
}
