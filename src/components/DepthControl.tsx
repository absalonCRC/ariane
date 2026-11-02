import { useId, useRef, useState } from 'react';
import { depthLevel } from './depthLevels';

export function DepthControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const { index: level, label } = depthLevel(value);
  return (
    <div
      className="depth-control"
      data-open={open}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          trigger.current?.focus();
          setOpen(false);
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <button
        ref={trigger}
        className="depth-label"
        aria-label={`Profondeur ${level} : ${label}. Régler la profondeur`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <div id={id} className="depth-slider" aria-hidden={!open} inert={!open}>
        <span aria-hidden="true">{level}</span>
        <input
          aria-label="Profondeur des sources"
          aria-valuetext={`Niveau ${level} : ${label}`}
          type="range"
          min="0"
          max="5"
          value={level}
          onChange={(event) => onChange(+event.target.value)}
        />
      </div>
    </div>
  );
}
