import { ChevronDown, Globe2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { changeInterfaceLanguage } from './localeLetterTransition';
import { languages, t, useLocale } from '../i18n';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const stop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stop.current?.(), []);
  return (
    <label className="language-switcher">
      <Globe2 size={15} aria-hidden="true" />
      {compact ? (
        <>
          <span aria-hidden="true">{locale.toUpperCase()}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </>
      ) : (
        <span>{t('Langue de l’application')}</span>
      )}
      <select
        aria-label={t('Langue de l’application')}
        value={locale}
        onChange={(event) => {
          stop.current?.();
          stop.current = changeInterfaceLanguage(
            event.currentTarget,
            event.target.value as typeof locale,
          );
        }}
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
