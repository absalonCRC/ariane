import type { Settings as Values } from './types';
import { native } from './client';
import { Dialog } from '../components/Dialog';

export function Preferences({
  value,
  onChange,
  onClose,
  enrichmentError,
}: {
  value: Values;
  onChange: (value: Partial<Values>) => void;
  onClose: () => void;
  enrichmentError?: string;
}) {
  return (
    <Dialog title="Paramètres" onClose={onClose}>
      <div className="preferences">
        <h3>Sources et références</h3>
        <label className="settings-row">
          <span className="settings-label">Profondeur · {value.depth}</span>
          <input
            aria-label="Profondeur des sources"
            type="range"
            min="0"
            max="5"
            value={value.depth}
            onChange={(e) => onChange({ depth: +e.target.value })}
          />
          <div className="range-labels">
            <small>0 · Note détectée</small>
            <small>5 · Exploration</small>
          </div>
        </label>
        <label className="settings-row">
          <span className="settings-label">Références</span>
          <select
            value={value.citationStyle}
            onChange={(e) => onChange({ citationStyle: e.target.value as Values['citationStyle'] })}
          >
            <option value="notes">Notes simples</option>
            <option value="apa">Bibliographie · APA</option>
            <option value="chicago">Bibliographie · Chicago</option>
          </select>
        </label>
        <label className="settings-row check-label">
          <span className="settings-label">Enrichir les fiches pendant l’écriture</span>
          <input
            type="checkbox"
            checked={value.enrichment}
            disabled={!native}
            onChange={(e) => onChange({ enrichment: e.target.checked })}
          />
        </label>
        <p className="hint enrichment-help">
          {native
            ? 'Analyse locale après une pause. Champs explicites, passages et liens entre notes, conservés dans ce projet. Les fichiers du vault restent intacts.'
            : 'L’enrichissement local est disponible dans l’application macOS.'}
        </p>
        {enrichmentError && (
          <p className="error-text" role="status">
            Enrichissement suspendu : {enrichmentError}
          </p>
        )}
      </div>
    </Dialog>
  );
}
