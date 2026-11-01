import { Sun, Moon } from 'lucide-react';
export function ThemeSwitcher({ dark, onChange }: { dark: boolean; onChange: () => void }) {
  return (
    <button
      className="theme-switcher"
      role="switch"
      aria-checked={dark}
      aria-label="Thème sombre"
      title={dark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={onChange}
    >
      <span className="theme-switch-symbol" aria-hidden="true">
        <Sun size={14} className="theme-sun" />
        <Moon size={14} className="theme-moon" />
      </span>
      <span>{dark ? 'Sombre' : 'Clair'}</span>
    </button>
  );
}
