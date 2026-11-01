import { X } from 'lucide-react';
import type { Settings as Values } from './types';
import { FormattingToolbar } from '../components/FormattingToolbar';
import type { MarkdownFormat } from '../editor/formatMarkdown';
export function Settings({
  value,
  onChange,
  onClose,
  open,
  onFormat,
  canFormat,
}: {
  value: Values;
  onChange: (v: Partial<Values>) => void;
  onClose: () => void;
  open: boolean;
  onFormat: (format: MarkdownFormat) => void;
  canFormat: boolean;
}) {
  return (
    <section
      id="writing-settings"
      className="settings floating"
      aria-label="Réglages d’écriture"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="panel-top">
        <h2>Écriture et lecture</h2>
        <button className="icon-button" aria-label="Fermer les réglages" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <FormattingToolbar onFormat={onFormat} disabled={!canFormat} />
      <div className="settings-row" role="group" aria-label="Typographie">
        <span className="settings-label">Typographie</span>
        <div className="segmented">
          <button
            className={value.font === 'literary' ? 'active' : ''}
            onClick={() => onChange({ font: 'literary' })}
          >
            Littéraire
          </button>
          <button
            className={value.font === 'mono' ? 'active' : ''}
            onClick={() => onChange({ font: 'mono' })}
          >
            Chasse fixe
          </button>
        </div>
      </div>
      <label className="settings-row">
        <span className="settings-label">Taille du texte · {value.fontSize} px</span>
        <input
          aria-label="Taille du texte"
          type="range"
          min="17"
          max="30"
          value={value.fontSize}
          onChange={(e) => onChange({ fontSize: +e.target.value })}
        />
      </label>
      <label className="settings-row">
        <span className="settings-label">Concentration</span>
        <select
          value={value.focus}
          onChange={(e) => onChange({ focus: e.target.value as Values['focus'] })}
        >
          <option value="none">Aucune</option>
          <option value="paragraph">Paragraphe</option>
          <option value="sentence">Phrase</option>
        </select>
      </label>
      <div className="settings-row" role="group" aria-label="Défilement">
        <span className="settings-label">Défilement</span>
        <div className="segmented">
          <button
            className={!value.typewriter ? 'active' : ''}
            onClick={() => onChange({ typewriter: false })}
          >
            Classique
          </button>
          <button
            className={value.typewriter ? 'active' : ''}
            onClick={() => onChange({ typewriter: true })}
          >
            Machine à écrire
          </button>
        </div>
      </div>
    </section>
  );
}
