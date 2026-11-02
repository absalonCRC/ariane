import { t, useLocale, localeTag } from '../i18n';
import type { Settings } from '../app/types';

export function ReadingComfort({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  useLocale();
  return (
    <details className="reading-comfort">
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
          {t('Interligne · {0}', { 0: (value.lineHeight ?? 1.5).toLocaleString(localeTag()) })}
        </span>
        <input
          aria-label={t('Interligne')}
          type="range"
          min="1.3"
          max="1.9"
          step="0.1"
          value={value.lineHeight ?? 1.5}
          onChange={(event) => onChange({ lineHeight: +event.target.value })}
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
