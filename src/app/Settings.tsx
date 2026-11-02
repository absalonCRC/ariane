import { t, useLocale } from '../i18n';
import { useRef } from 'react';
import { usePanelFocus } from '../components/usePanelFocus';
import { WritingModes } from '../components/WritingModes';
import { TypographyModes } from '../components/TypographyModes';
import { ReadingComfort } from '../components/ReadingComfort';
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
  onFocusPreview,
  onFontPreview,
  onScrollPreview,
}: {
  value: Values;
  onChange: (v: Partial<Values>) => void;
  onClose: () => void;
  open: boolean;
  onFormat: (format: MarkdownFormat) => void;
  canFormat: boolean;
  onFocusPreview?: (mode: Values['focus'] | null) => void;
  onFontPreview?: (font: Values['font'] | null) => void;
  onScrollPreview?: (mode: boolean | null) => void;
}) {
  useLocale();
  const panel = useRef<HTMLElement>(null);
  usePanelFocus(panel, open);
  return (
    <section
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
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
      <TypographyModes
        value={value.font}
        onChange={(font) => onChange({ font })}
        onPreview={onFontPreview}
      />
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
      <WritingModes
        value={value}
        onChange={onChange}
        onFocusPreview={onFocusPreview}
        onScrollPreview={onScrollPreview}
      />
      {value.typewriter && (
        <label className="settings-row check-label">
          <span className="settings-label">{t('Son de machine à écrire')}</span>
          <input
            type="checkbox"
            checked={value.typewriterSound}
            onChange={(event) => onChange({ typewriterSound: event.target.checked })}
          />
        </label>
      )}
      <ReadingComfort value={value} onChange={onChange} />
    </section>
  );
}
