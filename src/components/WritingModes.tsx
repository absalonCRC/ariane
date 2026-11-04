import { t, useLocale } from '../i18n';
import type { Settings } from '../contracts/settings';
import { PreviewButton } from './PreviewButton';
type FocusMode = Settings['focus'];
function FocusModeIcon({ mode }: { mode: FocusMode }) {
  return (
    <svg viewBox="0 0 24 20" width="20" height="18" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
        <path d="M3 3.5h18M3 7h14" opacity={mode === 'none' ? 1 : 0.32} />
        <path d="M3 12h18M3 15.5h14" opacity={mode === 'sentence' || mode === 'word' ? 0.32 : 1} />
        {mode === 'sentence' && <path d="M3 12h11" strokeWidth="2.2" />}
        {mode === 'word' && <path d="M3 12h4" strokeWidth="2.2" />}
      </g>
    </svg>
  );
}
function ScrollModeIcon({ typewriter }: { typewriter: boolean }) {
  return (
    <svg viewBox="0 0 24 20" width="20" height="18" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M3 4h12M3 8h12M3 12h12M3 16h12" opacity={typewriter ? 0.35 : 1} />
        {typewriter && <path d="M3 10h12" strokeWidth="2" />}
        {typewriter ? <path d="M18 7l3 3-3 3" /> : <path d="M19 3v14m-2-2 2 2 2-2m-4-10 2-2 2 2" />}
      </g>
    </svg>
  );
}
export function WritingModes({
  value,
  onChange,
  onFocusPreview,
  onScrollPreview,
}: {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onFocusPreview?: (mode: FocusMode | null) => void;
  onScrollPreview?: (mode: boolean | null) => void;
}) {
  useLocale();
  return (
    <>
      <div className="settings-row" role="group" aria-label={t('Concentration')}>
        <span className="settings-label">{t('Concentration')}</span>
        <div className="segmented mode-options focus-mode-options">
          {(
            [
              ['none', 'Aucune'],
              ['paragraph', 'Paragraphe'],
              ['sentence', 'Phrase'],
              ['word', 'Mot'],
            ] as const
          ).map(([mode, label]) => (
            <PreviewButton
              key={mode}
              value={mode}
              label={t(label)}
              active={value.focus === mode}
              onSelect={() => onChange({ focus: mode })}
              onPreview={onFocusPreview}
            >
              <FocusModeIcon mode={mode} />
            </PreviewButton>
          ))}
        </div>
      </div>
      <div className="settings-row" role="group" aria-label={t('Défilement')}>
        <span className="settings-label">{t('Défilement')}</span>
        <div className="segmented mode-options scroll-mode-options">
          {(
            [
              [false, 'Classique'],
              [true, 'Machine à écrire'],
            ] as const
          ).map(([mode, label]) => (
            <PreviewButton
              key={label}
              value={mode}
              label={t(label)}
              active={value.typewriter === mode}
              onSelect={() => onChange({ typewriter: mode })}
              onPreview={onScrollPreview}
            >
              <ScrollModeIcon typewriter={mode} />
            </PreviewButton>
          ))}
        </div>
      </div>
    </>
  );
}
