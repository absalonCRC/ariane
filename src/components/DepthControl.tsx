import { useId, useState } from 'react';

const levels = [
  { label: 'Notes reconnues', detail: 'Notes dont le nom ou un alias est reconnu dans le texte.' },
  { label: 'Notes et liens', detail: 'Notes reconnues et notes auxquelles elles renvoient.' },
  { label: 'Liens et thèmes', detail: 'Notes reconnues, liens directs et thèmes partagés.' },
  {
    label: 'Recherche associée',
    detail: 'Liens et thèmes, avec une recherche de sources associées.',
  },
  {
    label: 'Liens étendus',
    detail: 'Recherche associée et liens supplémentaires au deuxième degré.',
  },
  { label: 'Exploration élargie', detail: 'Liens étendus et recherche associée plus large.' },
] as const;

export function DepthControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const level = Math.max(0, Math.min(5, Math.round(value)));
  const { label, detail } = levels[level];
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
          setOpen(false);
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <button
        className="depth-label"
        aria-label={`Profondeur ${level} : ${detail} Régler la profondeur`}
        aria-expanded={open}
        aria-controls={id}
        title={detail}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <div id={id} className="depth-slider" aria-hidden={!open} inert={!open}>
        <span aria-hidden="true">{level}</span>
        <input
          aria-label="Profondeur des sources"
          aria-valuetext={`Niveau ${level} : ${label}. ${detail}`}
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
