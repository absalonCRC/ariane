import { t, useLocale, localeTag } from '../i18n';
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
  hideNotes = false,
  mode,
  onChange,
}: {
  words: number;
  characters: number;
  lines: number;
  notes: number;
  notesStatus: 'loading' | 'ready' | 'error';
  hideNotes?: boolean;
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  useLocale();
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
    timer.phase === 'focus'
      ? t('Concentration')
      : timer.phase === 'break'
        ? t('Pause')
        : t('Pause longue');
  const running = timer.deadline !== null;
  const started = running || timer.completed > 0 || timer.remainingMs !== durations.focus;
  const progress = Math.max(0, Math.min(1, 1 - ms / durations[timer.phase]));
  const timerHue = Math.round((8 + 132 * progress) * 100) / 100;
  const id = useId();
  const count = mode === 'characters' ? characters : mode === 'lines' ? lines : words;
  const unit =
    mode === 'characters'
      ? count === 1
        ? t('caractère')
        : t('caractères')
      : mode === 'lines'
        ? count === 1
          ? t('ligne')
          : t('lignes')
        : count === 1
          ? t('mot')
          : t('mots');
  const noteCount =
    notesStatus === 'loading'
      ? '…'
      : notesStatus === 'error'
        ? '—'
        : notes.toLocaleString(localeTag());
  const noteUnit = notesStatus === 'ready' && notes === 1 ? t('note') : t('notes');
  const noteDescription =
    notesStatus === 'loading'
      ? t('Recherche des notes du vault en cours')
      : notesStatus === 'error'
        ? t('Nombre de notes du vault indisponible')
        : t('{0} {1} du vault {2} pour le passage affiché', {
            0: noteCount,
            1: noteUnit,
            2: notes === 1 ? t('suggérée') : t('suggérées'),
          });
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
        data-hint={t('Compteur et minuteur · survoler ou cliquer')}
        aria-description={t('Compteur et minuteur · survoler ou cliquer')}
        aria-label={`${count.toLocaleString(localeTag())} ${unit}${hideNotes ? '' : ` · ${noteDescription}`}${started ? ` · ${phase} ${formatTime(ms)}${running ? '' : t(' en pause')}` : ''} · ${t('Ouvrir la barre')}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        {count.toLocaleString(localeTag())} {unit}
        {!hideNotes && (
          <>
            {' '}
            · {noteCount} {noteUnit}
          </>
        )}
        {started && (
          <span className="counter-timer-inline" aria-hidden="true">
            {' '}
            · {timer.phase !== 'focus' ? t('pause ') : ''}
            {formatTime(ms)}
          </span>
        )}
      </button>
      <div
        id={id}
        className="counter-choices"
        role="toolbar"
        aria-label={t('Compteur et Pomodoro')}
        aria-hidden={!open}
        inert={!open}
      >
        {(
          [
            ['characters', t('Caractères'), CaseSensitive],
            ['words', t('Mots'), WholeWord],
            ['lines', t('Lignes'), AlignLeft],
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
          aria-label={running ? t('Mettre le minuteur en pause') : t('Démarrer le minuteur')}
          onClick={toggle}
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button
          className="pomodoro-action"
          aria-label={t('Recommencer le cycle Pomodoro')}
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
