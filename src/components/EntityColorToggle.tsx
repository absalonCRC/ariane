import { t } from '../i18n';
import type { Settings } from '../app/types';

export function EntityColorToggle({
  value,
  onChange,
  compact = false,
}: {
  value: Settings;
  onChange: (value: Partial<Settings>) => void;
  compact?: boolean;
}) {
  return (
    <label className={compact ? 'settings-row check-label' : 'preference-toggle'}>
      <span>{t('Colorer les entités reconnues')}</span>
      <input
        type="checkbox"
        checked={value.entityHighlighting !== false}
        onChange={(event) => onChange({ entityHighlighting: event.target.checked })}
      />
    </label>
  );
}
