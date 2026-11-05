import { useState } from 'react';
import { X } from 'lucide-react';
import type { SmartTag } from '../contracts/smartTags';
import { t } from '../i18n';
export function TagChip({
  tag,
  onOpen,
  onRemove,
  removeLabel,
  onError,
}: {
  tag: SmartTag;
  onOpen: () => void;
  onRemove?: () => void | Promise<void>;
  removeLabel?: string;
  onError?: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <span
      className="smart-tag smart-tag-with-actions"
      style={{ '--tag-color': tag.color } as React.CSSProperties}
    >
      <button type="button" className="smart-tag-label" onClick={onOpen}>
        #{tag.name}
      </button>
      {onRemove && (
        <button
          type="button"
          className="smart-tag-remove"
          disabled={busy}
          aria-label={removeLabel ?? t('Retirer le tag {0}', { 0: tag.name })}
          title={removeLabel ?? t('Retirer le tag {0}', { 0: tag.name })}
          onClick={() => {
            setBusy(true);
            void Promise.resolve()
              .then(onRemove)
              .catch((error) => onError?.(error))
              .finally(() => setBusy(false));
          }}
        >
          <X size={11} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
