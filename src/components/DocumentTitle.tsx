import { useEffect, useState } from 'react';
export function DocumentTitle({
  title,
  readOnly,
  onCommit,
}: {
  title: string;
  readOnly: boolean;
  onCommit: (title: string) => void;
}) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  return (
    <input
      className="document-title"
      aria-label="Titre de la section"
      value={value}
      readOnly={readOnly}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() && value !== title) onCommit(value.trim());
        else setValue(title);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
