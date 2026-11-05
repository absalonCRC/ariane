import { t, useLocale } from '../i18n';
import { useId, useRef, useState } from 'react';
import { depthLevel } from './depthLevels';

export function DepthControl({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const expanded = open && !disabled;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const { index: level, label } = depthLevel(value);
  return (
    <div
      className="depth-control"
      data-open={expanded}
      onPointerEnter={(event) => {
        if (!disabled && event.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => {
        if (!disabled) setOpen(true);
      }}
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
        disabled={disabled}
        aria-label={t('Profondeur {0} : {1}. Régler la profondeur', { 0: level, 1: label })}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <div id={id} className="depth-slider" aria-hidden={!expanded} inert={!expanded}>
        <span aria-hidden="true">{level}</span>
        <input
          aria-label={t('Profondeur des sources')}
          aria-valuetext={t('Niveau {0} : {1}', { 0: level, 1: label })}
          type="range"
          disabled={disabled}
          min="0"
          max="5"
          value={level}
          onChange={(event) => {
            if (!disabled) onChange(+event.target.value);
          }}
        />
      </div>
    </div>
  );
}
