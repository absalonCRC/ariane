import { localizeMessage, t, useLocale } from '../i18n';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { native, request } from '../app/client';
import type { EditorHandle } from '../editor/Editor';
import type { ReviewTarget } from '../editor/reviewTarget';
import { reviewSuggestions, type LanguageIssue, type ReviewSuggestion } from './suggestions';

type Result = {
  issues: LanguageIssue[];
  model: string | null;
  languageError: string | null;
  modelError: string | null;
};
export function ReviewPanel({
  editor,
  language,
  open,
}: {
  editor: RefObject<EditorHandle | null>;
  language: string;
  open: boolean;
}) {
  useLocale();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<ReviewSuggestion[]>([]);
  const target = useRef<ReviewTarget | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    target.current = null;
    setItems([]);
    setMessage('');
    setBusy(false);
    if (!open) return;
    let live = true;
    void request<{ available: boolean }>('revisionStatus')
      .then((status) => {
        if (live) setAvailable(status.available);
      })
      .catch(() => {
        if (live) setAvailable(false);
      });
    return () => {
      live = false;
      sequence.current++;
    };
  }, [open, language]);
  async function run() {
    const selected = editor.current?.reviewTarget();
    setItems([]);
    if (!selected || !selected.text.trim()) {
      setMessage(
        t('Place le curseur dans un passage ou sélectionne du texte dans une seule scène.'),
      );
      return;
    }
    if (Array.from(selected.text).length > 800) {
      setMessage(t('Sélectionne un passage de 800 caractères maximum.'));
      return;
    }
    const id = ++sequence.current;
    target.current = selected;
    setBusy(true);
    setMessage('');
    try {
      const result = await request<Result>('revisionCheck', { text: selected.text, language });
      if (id !== sequence.current) return;
      if (!selected.isCurrent()) {
        setMessage(t('Le texte a changé ; relance la révision.'));
        return;
      }
      const suggestions = reviewSuggestions(
        selected.text,
        result.issues,
        result.model,
        selected.protected,
      );
      setItems(suggestions);
      const unavailable = result.languageError || result.modelError;
      setMessage(
        result.languageError && result.modelError
          ? t('Les moteurs de révision sont indisponibles.')
          : unavailable
            ? t('Un des moteurs est indisponible ; résultats partiels.')
            : suggestions.length
              ? ''
              : t('Aucune suggestion disponible pour ce passage.'),
      );
    } catch {
      if (id === sequence.current) setMessage(t('La révision locale est indisponible.'));
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  }
  function apply(item: ReviewSuggestion) {
    const applied = target.current?.apply(item);
    target.current = null;
    setItems([]);
    setMessage(
      applied ? t('Correction appliquée.') : t('Le texte a changé ; relance la révision.'),
    );
  }
  return (
    <div className="revision-panel">
      <div className="revision-heading">
        <span>{t('Révision locale')}</span>
        <button
          type="button"
          disabled={!available || busy}
          title={t('Réviser la sélection ou la ligne active (800 caractères maximum)')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void run()}
        >
          {busy ? t('Analyse…') : t('Réviser le passage')}
        </button>
      </div>
      {!available && (
        <p className="revision-message">
          {native ? t('Moteurs locaux indisponibles.') : t('Disponible dans l’application macOS.')}
        </p>
      )}
      {message && (
        <p className="revision-message" role="status">
          {localizeMessage(message)}
        </p>
      )}
      {items.length > 0 && (
        <div className="revision-suggestions" aria-label={t('Suggestions de révision')}>
          {items.map((item, index) => (
            <div
              className="revision-suggestion"
              key={`${item.from}:${item.to}:${item.replacement}:${index}`}
            >
              <span className="revision-explanation">
                {item.source === 'model' ? t('IA locale') : item.message}
              </span>
              <button
                type="button"
                onClick={() => apply(item)}
                title={t('Appliquer cette suggestion')}
              >
                <del>{item.original}</del>
                <span aria-hidden="true">→</span>
                <strong>{item.replacement}</strong>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
