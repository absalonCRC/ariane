import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { AlignLeft, CaseSensitive, Play, Pause, RotateCcw, WholeWord } from 'lucide-react';
import { usePomodoro } from '../timer/usePomodoro';
import { durations, formatTime } from '../timer/pomodoro';
import type { Settings } from '../app/types';

type Mode = Settings['countMode'];
export function WritingCounter({
  words,
  characters,
  lines,
  notes,
  notesStatus,
  mode,
  onChange,
}: {
  words: number;
  characters: number;
  lines: number;
  notes: number;
  notesStatus: 'loading' | 'ready' | 'error';
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const pendingClose = useRef(false);
  useEffect(() => {
    const parent = root.current?.parentElement;
    let frame = 0;
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
      if (!pendingClose.current) return;
      pendingClose.current = false;
      frame = requestAnimationFrame(() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      });
    };
    const leave = () => {
      if (!root.current?.contains(document.activeElement)) setOpen(false);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    parent?.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
      parent?.removeEventListener('pointerleave', leave);
    };
  }, []);
  const { timer, ms, toggle, reset } = usePomodoro();
  const phase =
    timer.phase === 'focus' ? 'Concentration' : timer.phase === 'break' ? 'Pause' : 'Pause longue';
  const running = timer.deadline !== null;
  const started = running || timer.completed > 0 || timer.remainingMs !== durations.focus;
  const progress = Math.max(0, Math.min(1, 1 - ms / durations[timer.phase]));
  const timerHue = Math.round((8 + 132 * progress) * 100) / 100;
  const id = useId();
  const count = mode === 'characters' ? characters : mode === 'lines' ? lines : words;
  const unit =
    mode === 'characters'
      ? count === 1
        ? 'caractère'
        : 'caractères'
      : mode === 'lines'
        ? count === 1
          ? 'ligne'
          : 'lignes'
        : count === 1
          ? 'mot'
          : 'mots';
  const noteCount =
    notesStatus === 'loading' ? '…' : notesStatus === 'error' ? '—' : notes.toLocaleString('fr-FR');
  const noteUnit = notesStatus === 'ready' && notes === 1 ? 'note' : 'notes';
  const noteDescription =
    notesStatus === 'loading'
      ? 'Recherche des notes du vault en cours'
      : notesStatus === 'error'
        ? 'Nombre de notes du vault indisponible'
        : `${noteCount} ${noteUnit} du vault ${notes === 1 ? 'suggérée' : 'suggérées'} pour le passage affiché`;
  return (
    <div
      ref={root}
      className="writing-counter"
      data-open={open}
      data-timer-active={started}
      style={started ? ({ '--timer-hue': `${timerHue}deg` } as CSSProperties) : undefined}
      data-mode={mode}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (
          e.relatedTarget instanceof Node &&
          e.currentTarget.parentElement?.contains(e.relatedTarget)
        )
          return;
        if (!e.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          if (pointerDown.current) pendingClose.current = true;
          else setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          root.current?.querySelector<HTMLButtonElement>('.counter-value')?.focus();
          setOpen(false);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <button
        className="counter-value"
        data-hint="Compteur et minuteur · survoler ou cliquer"
        aria-description="Compteur et minuteur · survoler ou cliquer"
        aria-label={`${count.toLocaleString('fr-FR')} ${unit} · ${noteDescription}${started ? ` · ${phase} ${formatTime(ms)}${running ? '' : ' en pause'}` : ''} · Ouvrir la barre`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        {count.toLocaleString('fr-FR')} {unit}
        {' · '}
        {noteCount} {noteUnit}
        {started && (
          <span className="counter-timer-inline" aria-hidden="true">
            {' '}
            · {timer.phase !== 'focus' ? 'pause ' : ''}
            {formatTime(ms)}
          </span>
        )}
      </button>
      <div
        id={id}
        className="counter-choices"
        role="toolbar"
        aria-label="Compteur et Pomodoro"
        aria-hidden={!open}
        inert={!open}
      >
        {(
          [
            ['characters', 'Caractères', CaseSensitive],
            ['words', 'Mots', WholeWord],
            ['lines', 'Lignes', AlignLeft],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            className="counter-mode"
            aria-label={label}
            data-tooltip={label}
            aria-pressed={mode === value}
            onClick={() => {
              onChange(value);
              root.current?.querySelector<HTMLButtonElement>('.counter-value')?.focus();
              setOpen(false);
            }}
          >
            <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
          </button>
        ))}
        <span className="pomodoro-time" title={phase} aria-label={`${phase} : ${formatTime(ms)}`}>
          {formatTime(ms)}
        </span>
        <button
          className="pomodoro-action"
          aria-label={running ? 'Mettre le minuteur en pause' : 'Démarrer le minuteur'}
          onClick={toggle}
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button
          className="pomodoro-action"
          aria-label="Recommencer le cycle Pomodoro"
          onClick={reset}
        >
          <RotateCcw size={12} />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {started ? phase : ''}
      </span>
    </div>
  );
}
