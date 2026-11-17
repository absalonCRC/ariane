import { Inbox, GitCompareArrows, Settings2, Tags, Trash2, UserRound } from 'lucide-react';
import { t, useLocale } from '../i18n';

export function BinderActions({
  historyMode,
  currentSurface,
  trash,
  onSurface,
  onTrash,
}: {
  historyMode?: boolean;
  currentSurface?: 'profile' | 'preferences' | 'tags' | 'entities' | 'inbox' | null;
  trash: boolean;
  onSurface: (surface: 'tags' | 'history' | 'preferences' | 'profile') => void;
  onTrash: () => void;
}) {
  useLocale();
  return (
    <>
      <button
        aria-current={currentSurface === 'inbox' ? 'page' : undefined}
        aria-label={t('Boîte de réception')}
        data-tooltip={t('Boîte de réception')}
        onClick={() => window.dispatchEvent(new Event('ariane-inbox-open'))}
      >
        <Inbox size={17} aria-hidden="true" />
      </button>
      <button
        aria-current={currentSurface === 'tags' ? 'page' : undefined}
        aria-label={t('Smart-tags')}
        data-tooltip={t('Smart-tags')}
        onClick={() => onSurface('tags')}
      >
        <Tags size={17} aria-hidden="true" />
      </button>
      <button
        aria-current={historyMode && !currentSurface ? 'page' : undefined}
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
        className="binder-profile"
        aria-current={currentSurface === 'profile' ? 'page' : undefined}
        aria-label={t('Profil')}
        data-tooltip={t('Profil')}
        onClick={() => onSurface('profile')}
      >
        <UserRound size={17} aria-hidden="true" />
        <span>{t('Profil')}</span>
      </button>
      <button
        className="binder-preferences"
        aria-current={currentSurface === 'preferences' ? 'page' : undefined}
        aria-label={t('Paramètres')}
        data-tooltip={t('Paramètres')}
        onClick={() => onSurface('preferences')}
      >
        <Settings2 size={17} aria-hidden="true" />
        <span>{t('Paramètres')}</span>
      </button>
    </>
  );
}
