import { usePresenceValue } from './Presence';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Strikethrough, Link2, Quote } from 'lucide-react';
import type { MarkdownFormat } from '../editor/formatMarkdown';
import { useContextMenuOpen } from './ContextMenu';

export interface SelectionAnchor {
  left: number;
  top: number;
  bottom: number;
}
const actions = [
  ['bold', 'Gras', Bold],
  ['italic', 'Italique', Italic],
  ['strike', 'Barré', Strikethrough],
  ['link', 'Lien', Link2],
  ['quote', 'Citation', Quote],
] as const;

export function SelectionToolbar({
  anchor,
  onFormat,
}: {
  anchor: SelectionAnchor | null;
  onFormat: (format: MarkdownFormat) => void;
}) {
  const menuOpen = useContextMenuOpen();
  const ref = useRef<HTMLDivElement>(null);
  const visible = !!anchor && !menuOpen;
  const shown = usePresenceValue(visible ? anchor : null, !menuOpen);
  useLayoutEffect(() => {
    if (!anchor || !visible || !ref.current) return;
    const panel = ref.current,
      rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.left - rect.width / 2, innerWidth - rect.width - 8))}px`;
    const above = anchor.top - rect.height - 9;
    panel.style.top = `${above >= 40 ? above : Math.min(anchor.bottom + 9, innerHeight - rect.height - 8)}px`;
  }, [anchor, visible]);
  if (!shown.value) return null;
  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label="Mettre en forme la sélection"
      className="selection-toolbar"
      data-phase={shown.exiting ? 'exit' : 'open'}
      inert={shown.exiting}
      aria-hidden={shown.exiting || undefined}
      style={{ left: shown.value.left, top: shown.value.top }}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = [...event.currentTarget.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'ArrowRight'
            ? (index + 1) % buttons.length
            : event.key === 'ArrowLeft'
              ? (index - 1 + buttons.length) % buttons.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : null;
        if (next !== null) {
          event.preventDefault();
          event.stopPropagation();
          buttons[next]?.focus();
        }
      }}
    >
      {actions.map(([format, label, Icon]) => (
        <button
          key={format}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => {
            if (!shown.exiting) onFormat(format);
          }}
        >
          <Icon size={15} strokeWidth={1.6} />
        </button>
      ))}
    </div>,
    document.body,
  );
}
