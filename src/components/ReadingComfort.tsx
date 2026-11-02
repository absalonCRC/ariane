import type { Settings } from '../app/types';

export function ReadingComfort({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <details className="reading-comfort">
      <summary>Confort de lecture</summary>
      <label className="settings-row">
        <span className="settings-label">Largeur · {value.columnWidth ?? 750}</span>
        <input
          aria-label="Largeur de la colonne"
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
          Interligne · {(value.lineHeight ?? 1.5).toLocaleString('fr-FR')}
        </span>
        <input
          aria-label="Interligne"
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
        Valeurs par défaut
      </button>
    </details>
  );
}
