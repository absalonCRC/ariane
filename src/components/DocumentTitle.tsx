import { useContextMenu } from './ContextMenu';
import { Copy, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
export function DocumentTitle({
  title,
  readOnly,
  onCommit,
  autoFocus = false,
  onAutoFocus,
  onEnter,
}: {
  title: string;
  readOnly: boolean;
  onCommit: (title: string) => void;
  autoFocus?: boolean;
  onAutoFocus?: () => void;
  onEnter?: () => void;
}) {
  const openMenu = useContextMenu();
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  return (
    <input
      className="document-title"
      aria-label="Titre de la section"
      placeholder={readOnly ? undefined : 'Titre de la page'}
      autoFocus={autoFocus}
      onFocus={() => {
        if (autoFocus) onAutoFocus?.();
      }}
      value={value}
      readOnly={readOnly}
      onContextMenu={(event) => {
        const input = event.currentTarget;
        openMenu(event, {
          title: 'Titre',
          groups: [
            [
              ...(!readOnly
                ? [
                    {
                      label: 'Modifier le titre',
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
                      label: 'Copier le titre',
                      icon: Copy,
                      run: () => navigator.clipboard.writeText(value),
                    },
                  ]
                : []),
            ],
          ],
        });
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() && value !== title) onCommit(value.trim());
        else setValue(title);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
          onEnter?.();
        }
      }}
    />
  );
}
