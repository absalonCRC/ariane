import { t, useLocale } from '../i18n';
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
  useLocale();
  return (
    <section
      id="writing-settings"
      className="settings floating"
      aria-label={t('Réglages d’écriture')}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="panel-top">
        <h2>{t('Écriture et lecture')}</h2>
        <button className="icon-button" aria-label={t('Fermer les réglages')} onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <FormattingToolbar onFormat={onFormat} disabled={!canFormat} />
      <div className="settings-row" role="group" aria-label={t('Typographie')}>
        <span className="settings-label">{t('Typographie')}</span>
        <div className="segmented">
          <button
            className={value.font === 'literary' ? 'active' : ''}
            onClick={() => onChange({ font: 'literary' })}
          >
            {t('Littéraire')}
          </button>
          <button
            className={value.font === 'mono' ? 'active' : ''}
            onClick={() => onChange({ font: 'mono' })}
          >
            {t('Chasse fixe')}
          </button>
        </div>
      </div>
      <label className="settings-row">
        <span className="settings-label">
          {t('Taille du texte · {0} px', { 0: value.fontSize })}
        </span>
        <input
          aria-label={t('Taille du texte')}
          type="range"
          min="17"
          max="30"
          value={value.fontSize}
          onChange={(e) => onChange({ fontSize: +e.target.value })}
        />
      </label>
      <label className="settings-row">
        <span className="settings-label">{t('Concentration')}</span>
        <select
          value={value.focus}
          onChange={(e) => onChange({ focus: e.target.value as Values['focus'] })}
        >
          <option value="none">{t('Aucune')}</option>
          <option value="paragraph">{t('Paragraphe')}</option>
          <option value="sentence">{t('Phrase')}</option>
        </select>
      </label>
      <div className="settings-row" role="group" aria-label={t('Défilement')}>
        <span className="settings-label">{t('Défilement')}</span>
        <div className="segmented">
          <button
            className={!value.typewriter ? 'active' : ''}
            onClick={() => onChange({ typewriter: false })}
          >
            {t('Classique')}
          </button>
          <button
            className={value.typewriter ? 'active' : ''}
            onClick={() => onChange({ typewriter: true })}
          >
            {t('Machine à écrire')}
          </button>
        </div>
      </div>
    </section>
  );
}
