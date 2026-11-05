import { t, useLocale } from '../i18n';
import { useContextMenu } from './ContextMenu';
import { Copy, Pencil } from 'lucide-react';
import { useTitleTagInput, type TitleTagInput } from '../tags/useTitleTagInput';
import { TagChip } from '../tags/TagChip';
export function DocumentTitle({
  title,
  readOnly,
  onCommit,
  autoFocus = false,
  onAutoFocus,
  onEnter,
  tagInput,
}: {
  title: string;
  readOnly: boolean;
  onCommit: (title: string) => void | Promise<void>;
  autoFocus?: boolean;
  onAutoFocus?: () => void;
  onEnter?: () => void;
  tagInput?: TitleTagInput;
}) {
  useLocale();
  const openMenu = useContextMenu();
  const draft = useTitleTagInput(title, readOnly, onCommit, tagInput);
  const value = draft.value;
  return (
    <div className="document-title-row">
      <span className="document-title-input">
        <span className="document-title-measure" aria-hidden="true">
          {value || t('Titre de la page')}
        </span>
        <input
          ref={draft.input}
          className="document-title"
          aria-label={t('Titre de la section')}
          placeholder={readOnly ? undefined : t('Titre de la page')}
          autoFocus={autoFocus}
          onFocus={() => {
            if (autoFocus) onAutoFocus?.();
          }}
          value={value}
          readOnly={readOnly}
          onContextMenu={(event) => {
            const input = event.currentTarget;
            openMenu(event, {
              title: t('Titre'),
              groups: [
                [
                  ...(!readOnly
                    ? [
                        {
                          label: t('Modifier le titre'),
                          icon: Pencil,
                          run: () => {
                            input.focus();
                            input.select();
                          },
                        },
                      ]
                    : []),
                  ...(typeof navigator.clipboard?.writeText === 'function'
                    ? [
                        {
                          label: t('Copier le titre'),
                          icon: Copy,
                          run: () => navigator.clipboard.writeText(value),
                        },
                      ]
                    : []),
                ],
              ],
            });
          }}
          onChange={(e) => draft.change(e.target.value)}
          onCompositionStart={() => draft.composition(true)}
          onCompositionEnd={() => draft.composition(false)}
          onBlur={draft.blur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') draft.dismiss();
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
              onEnter?.();
            }
          }}
        />
      </span>
      {!!tagInput?.tags.length && (
        <div className="document-title-tags">
          {tagInput?.tags.map((tag) => (
            <TagChip
              tag={tag}
              key={tag.id}
              onOpen={() => tagInput.open(tag.id)}
              onRemove={tagInput.remove ? () => tagInput.remove!(tag.id) : undefined}
              removeLabel={tagInput.removalLabel?.(tag.id)}
              onError={tagInput.onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
