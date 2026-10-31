import { useRef, useState } from 'react';
import { FileText, Folder, Plus } from 'lucide-react';
import type { Project, Section } from '../app/types';
import { sectionPath } from './tree';

export function PathMenu({
  project,
  selected,
  continuous,
  onSelect,
  onAdd,
}: {
  project: Project;
  selected: Section | undefined;
  continuous: boolean;
  onSelect: (id: string) => void;
  onAdd: (parent: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const parent = continuous
    ? null
    : selected?.kind === 'scene'
      ? selected.parent
      : selected?.id || null;
  const byId = new Map(project.sections.map((section) => [section.id, section]));
  const path: Section[] = [];
  const seen = new Set<string>();
  let current = continuous ? undefined : selected;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  function nodes(): React.ReactNode {
    return path.map((section, depth) => (
      <button
        key={section.id}
        className="path-tree-item"
        style={{ paddingLeft: 12 + Math.min(depth + 1, 8) * 14 }}
        aria-current={selected?.id === section.id ? 'page' : undefined}
        onClick={() => {
          setOpen(false);
          onSelect(section.id);
        }}
      >
        {section.kind === 'scene' ? <FileText size={14} /> : <Folder size={14} />}
        <span>{section.title || 'Sans titre'}</span>
      </button>
    ));
  }
  return (
    <div
      className="path-menu"
      data-open={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        className="path-trigger"
        ref={trigger}
        aria-label="Arborescence du projet"
        aria-expanded={open}
        aria-controls="path-tree"
        onClick={(event) => setOpen(event.detail === 0 ? !open : true)}
      >
        {[
          project.name,
          ...(continuous ? ['Manuscrit entier'] : sectionPath(project.sections, selected)),
        ].join(' / ')}
      </button>
      <div className="path-popover" id="path-tree" aria-hidden={!open} inert={!open}>
        <nav aria-label="Hiérarchie de la page courante">
          <div className="path-tree-root">
            <Folder size={14} />
            <span>{project.name}</span>
          </div>
          {nodes()}
          {continuous && (
            <div className="path-tree-root path-tree-manuscript">
              <FileText size={14} />
              <span>Manuscrit entier</span>
            </div>
          )}
        </nav>
        <button
          className="path-add"
          onClick={() => {
            setOpen(false);
            onAdd(parent);
          }}
        >
          <Plus size={14} /> Nouvelle page
        </button>
      </div>
    </div>
  );
}
