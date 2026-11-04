import { t, useLocale } from '../i18n';
import type { Settings } from '../contracts/settings';
import { PreviewButton } from './PreviewButton';
type WritingFont = Settings['font'];
const writingFontLabels: Record<WritingFont, string> = {
  literary: 'Littéraire · EB Garamond',
  sans: 'Sans empattement · Figtree',
  mono: 'Chasse fixe · Source Code Pro',
};
export function TypographyModes({
  value,
  onChange,
  onPreview,
}: {
  value: WritingFont;
  onChange: (font: WritingFont) => void;
  onPreview?: (font: WritingFont | null) => void;
}) {
  useLocale();
  return (
    <div className="settings-row" role="group" aria-label={t('Typographie')}>
      <span className="settings-label">{t('Typographie')}</span>
      <div className="segmented font-mode-options">
        {(['literary', 'sans', 'mono'] as const).map((font) => (
          <PreviewButton
            key={font}
            value={font}
            label={t(writingFontLabels[font])}
            active={value === font}
            onSelect={() => onChange(font)}
            onPreview={onPreview}
          >
            <span className={'font-mode-icon font-mode-' + font} aria-hidden="true">
              Aa
            </span>
          </PreviewButton>
        ))}
      </div>
    </div>
  );
}
