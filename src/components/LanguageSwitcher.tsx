import { Globe2 } from 'lucide-react';
import { languages, setLocale, t, useLocale } from '../i18n';

export function LanguageSwitcher() {
  const locale = useLocale();
  return (
    <label className="language-switcher">
      <Globe2 size={15} aria-hidden="true" />
      <span>{t('Langue de l’application')}</span>
      <select
        aria-label={t('Langue de l’application')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
      >
        {languages.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
