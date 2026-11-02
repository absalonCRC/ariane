import { t, useLocale } from '../i18n';
import { Sun, Moon } from 'lucide-react';
export function ThemeSwitcher({ dark, onChange }: { dark: boolean; onChange: () => void }) {
  useLocale();
  return (
    <button
      className="theme-switcher"
      role="switch"
      aria-checked={dark}
      aria-label={t('Thème sombre')}
      data-tooltip={dark ? t('Passer au thème clair') : t('Passer au thème sombre')}
      onClick={onChange}
    >
      <span className="theme-switch-symbol" aria-hidden="true">
        <Sun size={17} className="theme-sun" />
        <Moon size={17} className="theme-moon" />
      </span>
    </button>
  );
}
