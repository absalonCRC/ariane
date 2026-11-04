import { Check, Plus } from 'lucide-react';
import { localizeMessage, t, useLocale } from '../i18n';

export interface MarginPinProps {
  pinned: boolean;
  busy: boolean;
  canPin: boolean;
  error?: string;
  onPin: () => void;
}

export function MarginPinAction({ pinned, busy, canPin, error, onPin }: MarginPinProps) {
  useLocale();
  return (
    <div className="source-pin-action">
      <button className="vault-result-pin" disabled={!canPin || busy || pinned} onClick={onPin}>
        {pinned ? <Check size={12} /> : <Plus size={12} />}
        {pinned ? t('Dans la marge') : t('Ajouter à la marge')}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {localizeMessage(error)}
        </p>
      )}
    </div>
  );
}
