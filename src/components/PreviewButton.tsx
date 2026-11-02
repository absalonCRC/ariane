import { useState, type ReactNode } from 'react';

// The visual preview is transient; only a click commits the selected value.
export function PreviewButton<T extends string | boolean>({
  value,
  label,
  active,
  onSelect,
  onPreview,
  children,
}: {
  value: T;
  label: string;
  active: boolean;
  onSelect: () => void;
  onPreview?: (value: T | null) => void;
  children: ReactNode;
}) {
  const [previewing, setPreviewing] = useState(false);
  const show = () => {
    setPreviewing(true);
    onPreview?.(value);
  };
  const hide = () => {
    setPreviewing(false);
    onPreview?.(null);
  };
  return (
    <button
      type="button"
      className={'preview-mode-button' + (active ? ' active' : '')}
      aria-label={label}
      data-tooltip={label}
      aria-pressed={active}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') show();
      }}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && previewing && onPreview) {
          hide();
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={() => {
        hide();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
