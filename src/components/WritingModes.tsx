import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Settings } from '../app/types';

type Preview = 'none' | 'paragraph' | 'sentence' | 'classic' | 'typewriter';
const descriptions: Record<Preview, string> = {
  none: 'Tout le texte reste visible.',
  paragraph: 'Le paragraphe actif se détache.',
  sentence: 'Seule la phrase active se détache.',
  classic: 'La page suit votre défilement.',
  typewriter: 'La ligne active reste au centre.',
};

function ModeButton({
  mode,
  label,
  active,
  onClick,
}: {
  mode: Preview;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(innerWidth - 282, rect.left)),
      top: rect.top > 190 ? rect.top - 180 : rect.bottom + 8,
    });
    setPreview(true);
  }
  useEffect(() => {
    const hide = () => setPreview(false);
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('resize', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);
  const id = useId();
  return (
    <span
      className="writing-mode"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') show();
      }}
      onPointerLeave={() => setPreview(false)}
      onFocus={show}
      onBlur={() => setPreview(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && preview) {
          setPreview(false);
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-pressed={active}
        aria-describedby={preview ? id : undefined}
        className={active ? 'active' : ''}
        onClick={onClick}
      >
        {label}
      </button>
      {preview &&
        createPortal(
          <span
            style={position}
            className="writing-mode-preview"
            role="tooltip"
            id={id}
            data-mode={mode}
          >
            <span className="mode-sample" aria-hidden="true">
              <span className="mode-lines">
                <span className="sample-before">La fenêtre donne sur le jardin.</span>
                <span className="sample-active">
                  Une phrase trouve son rythme. <span>Le jour se lève.</span>
                </span>
                <span className="sample-after">L’encre sèche sur le papier.</span>
              </span>
            </span>
            <span className="mode-caption">{descriptions[mode]}</span>
          </span>,
          trigger.current?.closest('dialog') ?? document.body,
        )}
    </span>
  );
}

export function WritingModes({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <>
      <div className="settings-row" role="group" aria-label="Concentration">
        <span className="settings-label">Concentration</span>
        <div className="segmented mode-options">
          {(
            [
              ['none', 'Aucune'],
              ['paragraph', 'Paragraphe'],
              ['sentence', 'Phrase'],
            ] as const
          ).map(([mode, label]) => (
            <ModeButton
              key={mode}
              mode={mode}
              label={label}
              active={value.focus === mode}
              onClick={() => onChange({ focus: mode })}
            />
          ))}
        </div>
      </div>
      <div className="settings-row" role="group" aria-label="Défilement">
        <span className="settings-label">Défilement</span>
        <div className="segmented mode-options">
          <ModeButton
            mode="classic"
            label="Classique"
            active={!value.typewriter}
            onClick={() => onChange({ typewriter: false })}
          />
          <ModeButton
            mode="typewriter"
            label="Machine à écrire"
            active={value.typewriter}
            onClick={() => onChange({ typewriter: true })}
          />
        </div>
      </div>
    </>
  );
}
