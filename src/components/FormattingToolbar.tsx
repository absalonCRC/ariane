import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  Image,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  FileCode2,
  Minus,
  Table2,
  NotebookText,
} from 'lucide-react';
import { useState } from 'react';
import type { MarkdownFormat } from '../editor/formatMarkdown';

const actions = [
  ['bold', 'Gras', Bold],
  ['italic', 'Italique', Italic],
  ['strike', 'Barré', Strikethrough],
  ['inline-code', 'Code en ligne', Code],
  ['link', 'Lien', Link2],
  ['image', 'Image', Image],
  ['bullet', 'Liste à puces', List],
  ['numbered', 'Liste numérotée', ListOrdered],
  ['task', 'Liste de tâches', ListTodo],
  ['quote', 'Citation', Quote],
  ['code-block', 'Bloc de code', FileCode2],
  ['rule', 'Insérer un séparateur', Minus],
  ['table', 'Insérer un tableau', Table2],
  ['footnote', 'Note de bas de page', NotebookText],
] as const;

export function FormattingToolbar({
  onFormat,
  disabled,
}: {
  onFormat: (format: MarkdownFormat) => void;
  disabled: boolean;
}) {
  const [hint, setHint] = useState('');
  return (
    <div className="formatting-panel" role="group" aria-label="Formatage Markdown">
      <div className="formatting-heading">
        <span>Formatage</span>
        <select
          aria-label="Niveau de titre"
          disabled={disabled}
          value=""
          onChange={(event) => {
            if (event.target.value) onFormat(event.target.value as MarkdownFormat);
          }}
        >
          <option value="">Titre…</option>
          <option value="paragraph">Texte normal</option>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option key={level} value={`heading-${level}`}>
              Titre {level}
            </option>
          ))}
        </select>
      </div>
      <div className="formatting-actions" role="group" aria-label="Mise en forme du texte">
        {actions.map(([format, label, Icon]) => (
          <button
            key={format}
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onMouseEnter={() => setHint(label)}
            onMouseLeave={() => setHint('')}
            onFocus={() => setHint(label)}
            onBlur={() => setHint('')}
            onClick={() => onFormat(format)}
          >
            <Icon size={15} strokeWidth={1.7} />
          </button>
        ))}
      </div>
      <div className="formatting-hint" aria-hidden="true">{hint || " "}</div>
    </div>
  );
}
