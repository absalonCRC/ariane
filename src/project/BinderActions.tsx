import { GitCompareArrows, Settings2, Tags, Trash2 } from 'lucide-react';
import { t, useLocale } from '../i18n';

export function BinderActions({
  historyMode,
  trash,
  onSurface,
  onTrash,
}: {
  historyMode?: boolean;
  trash: boolean;
  onSurface: (surface: 'tags' | 'history' | 'preferences') => void;
  onTrash: () => void;
}) {
  useLocale();
  return (
    <>
      <button
        aria-label={t('Smart-tags')}
        data-tooltip={t('Smart-tags')}
        onClick={() => onSurface('tags')}
      >
        <Tags size={17} aria-hidden="true" />
      </button>
      <button
        aria-current={historyMode ? 'page' : undefined}
        aria-label={t('Versions')}
        data-tooltip={t('Versions')}
        onClick={() => onSurface('history')}
      >
        <GitCompareArrows size={17} aria-hidden="true" />
      </button>
      <button
        aria-label={t('Corbeille')}
        aria-pressed={trash}
        data-tooltip={t('Corbeille')}
        onClick={onTrash}
      >
        <Trash2 size={17} aria-hidden="true" />
      </button>
      <button
        aria-label={t('Paramètres')}
        data-tooltip={t('Paramètres')}
        onClick={() => onSurface('preferences')}
      >
        <Settings2 size={17} aria-hidden="true" />
      </button>
    </>
  );
}
