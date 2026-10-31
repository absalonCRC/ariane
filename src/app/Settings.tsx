import { X } from 'lucide-react';
import type { Settings as Values } from './types';
import { FormattingToolbar } from '../components/FormattingToolbar';
import type { MarkdownFormat } from '../editor/formatMarkdown';
import type { EditorHandle } from '../editor/Editor';
import type { RefObject } from 'react';
import { native } from './client';
import { ReviewPanel } from '../revision/ReviewPanel';
export function Settings({
  value,
  onChange,
  onClose,
  open,
  onFormat,
  canFormat,
  editor,
  enrichmentError,
}: {
  value: Values;
  onChange: (v: Partial<Values>) => void;
  onClose: () => void;
  open: boolean;
  onFormat: (format: MarkdownFormat) => void;
  canFormat: boolean;
  editor: RefObject<EditorHandle | null>;
  enrichmentError?: string;
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
        <h2>Écriture</h2>
        <button className="icon-button" aria-label="Fermer les réglages" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <FormattingToolbar onFormat={onFormat} disabled={!canFormat} />
      <ReviewPanel editor={editor} language={value.language} open={open} />
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
        <span className="settings-label">Langue de correction</span>
        <select value={value.language} onChange={(e) => onChange({ language: e.target.value })}>
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
        </select>
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
        <input type="checkbox" checked={value.enrichment} disabled={!native}
          onChange={(e) => onChange({ enrichment: e.target.checked })} />
      </label>
      <p className="hint enrichment-help">{native
        ? 'Analyse locale après une pause. Champs explicites, passages et liens entre notes, conservés dans ce projet. Les fichiers du vault restent intacts.'
        : 'L’enrichissement local est disponible dans l’application macOS.'}</p>
      {enrichmentError && <p className="error-text" role="status">Enrichissement suspendu : {enrichmentError}</p>}
      <label className="settings-row check-label">
        <span className="settings-label">Remarques de style</span>
        <input
          type="checkbox"
          checked={value.revision}
          onChange={(e) => onChange({ revision: e.target.checked })}
        />
      </label>
    </section>
  );
}
