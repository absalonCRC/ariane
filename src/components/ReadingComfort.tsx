import { t, useLocale, localeTag } from '../i18n';
import type { Settings } from '../contracts/settings';
export function ReadingComfort({
  value,
  onChange,
  preview,
  onPreview,
}: {
  value: Settings;
  preview?: number | null;
  onPreview?: (height: number | null) => void;
  onChange: (patch: Partial<Settings>) => void;
}) {
  useLocale();
  const height = preview ?? value.lineHeight ?? 1.5;
  const commit = (next: number) => {
    if (next !== (value.lineHeight ?? 1.5)) onChange({ lineHeight: next });
    onPreview?.(null);
  };
  return (
    <details className="reading-comfort" open>
      <summary>{t('Confort de lecture')}</summary>
      <label className="settings-row">
        <span className="settings-label">
          {t('Largeur · {0}', { 0: value.columnWidth ?? 750 })}
        </span>
        <input
          aria-label={t('Largeur de la colonne')}
          type="range"
          min="560"
          max="900"
          step="10"
          value={value.columnWidth ?? 750}
          onChange={(event) => onChange({ columnWidth: +event.target.value })}
        />
      </label>
      <label className="settings-row">
        <span className="settings-label">
          {t('Interligne · {0}', { 0: height.toLocaleString(localeTag()) })}
        </span>
        <input
          aria-label={t('Interligne')}
          type="range"
          min="1.3"
          max="1.9"
          step="0.1"
          value={height}
          onChange={(event) =>
            onPreview ? onPreview(+event.target.value) : commit(+event.target.value)
          }
          onBlur={() => onPreview?.(null)}
          onPointerUp={(event) => {
            if (onPreview) commit(+event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (!onPreview || preview == null) return;
            if (event.key === 'Enter') commit(height);
            else if (event.key === 'Escape') onPreview(null);
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </label>
      <button
        type="button"
        className="comfort-reset"
        onClick={() => onChange({ columnWidth: 750, lineHeight: 1.5 })}
      >
        {t('Valeurs par défaut')}
      </button>
    </details>
  );
}
